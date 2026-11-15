package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

type agentGateway struct {
	store      *storage.Store
	lookuper   ipaddr.Lookuper
	binDir     string
	trustProxy bool

	mu       sync.Mutex
	failures int
	resetAt  time.Time
}

func newAgentGateway(store *storage.Store, lookuper ipaddr.Lookuper, binDir string, trustProxy bool) *agentGateway {
	if strings.TrimSpace(binDir) == "" {
		if envDir := strings.TrimSpace(os.Getenv("IRM_AGENT_BIN_DIR")); envDir != "" {
			binDir = envDir
		} else {
			binDir = "dist"
		}
	}
	return &agentGateway{
		store:      store,
		lookuper:   lookuper,
		binDir:     binDir,
		trustProxy: trustProxy,
	}
}

func (g *agentGateway) checkRateLimit(w http.ResponseWriter) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	if now.After(g.resetAt) {
		g.failures = 0
	}
	if now.Before(g.resetAt) && g.failures >= 15 {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "鉴权失败次数过多，请在 60 秒后重试")
		return false
	}
	return true
}

func (g *agentGateway) recordAuthFailure() {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	if now.After(g.resetAt) {
		g.failures = 0
	}
	g.failures++
	g.resetAt = now.Add(time.Minute)
}

func extractBearerToken(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(authHeader) < 8 || !strings.EqualFold(authHeader[:7], "bearer ") {
		return ""
	}
	tok := strings.TrimSpace(authHeader[7:])
	if len(tok) > 160 {
		return ""
	}
	return tok
}

func enrichSnapshotLookup(ctx context.Context, lookuper ipaddr.Lookuper, snap protocol.Snapshot) *ipaddr.LookupResult {
	if lookuper == nil {
		return nil
	}
	candidate := strings.TrimSpace(snap.PublicIPv4)
	if candidate == "" {
		candidate = strings.TrimSpace(snap.PublicIPv6)
	}
	if candidate == "" {
		return nil
	}
	parsed, err := ipaddr.ParseAddress(candidate)
	if err != nil || !parsed.PublicRoutable {
		return nil
	}
	lctx, cancel := context.WithTimeout(ctx, 3500*time.Millisecond)
	defer cancel()
	res, err := lookuper.Lookup(lctx, parsed)
	if err != nil {
		return nil
	}
	return &res
}

func fillPublicIPFromRemoteAddr(r *http.Request, snap *protocol.Snapshot, trustProxy bool) {
	if snap.PublicIPv4 != "" || snap.PublicIPv6 != "" {
		return
	}
	host := strings.TrimSpace(r.RemoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	addr, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return
	}
	addr = addr.Unmap()
	if !ipaddr.IsPublicRoutable(addr) {
		if !trustProxy {
			return
		}
		realIP := strings.TrimSpace(r.Header.Get("X-Real-IP"))
		parsedReal, err := netip.ParseAddr(strings.Trim(realIP, "[]"))
		if err != nil {
			return
		}
		addr = parsedReal.Unmap()
		if !ipaddr.IsPublicRoutable(addr) {
			return
		}
	}
	if addr.Is4() {
		snap.PublicIPv4 = addr.String()
	} else if addr.Is6() {
		snap.PublicIPv6 = addr.String()
	}
}

func resolveAgentBinary(binDir, goos, goarch string) (string, error) {
	switch goos {
	case "linux", "darwin":
	default:
		return "", os.ErrNotExist
	}
	switch goarch {
	case "amd64", "arm64":
	default:
		return "", os.ErrNotExist
	}

	candidates := []string{
		filepath.Join(binDir, fmt.Sprintf("irm-agent-%s-%s", goos, goarch)),
	}
	if goos == runtime.GOOS && goarch == runtime.GOARCH {
		candidates = append(candidates, filepath.Join(binDir, "agent"))
	}
	for _, p := range candidates {
		info, err := os.Stat(p)
		if err == nil && info.Mode().IsRegular() && info.Size() > 0 {
			return p, nil
		}
	}
	return "", os.ErrNotExist
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (g *agentGateway) routes(r chi.Router) {
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/install.sh", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, installScriptText)
	})

	r.Get("/probe.sh", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, probeScriptText)
	})

	r.Get("/binary/{os}/{target}", func(w http.ResponseWriter, r *http.Request) {
		goos := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "os")))
		target := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "target")))
		wantChecksum := strings.HasSuffix(target, ".sha256")
		goarch := strings.TrimSuffix(target, ".sha256")

		binPath, err := resolveAgentBinary(g.binDir, goos, goarch)
		if err != nil {
			writeError(w, http.StatusNotFound, "binary_not_available", "当前尚未构建该系统架构的探针二进制文件（可先在服务端执行 pnpm build）")
			return
		}
		sum, err := sha256File(binPath)
		if err != nil {
			internalError(w, err)
			return
		}
		if wantChecksum {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprintf(w, "%s  irm-agent\n", sum)
			return
		}

		f, err := os.Open(binPath)
		if err != nil {
			internalError(w, err)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			internalError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("X-Checksum-Sha256", sum)
		http.ServeContent(w, r, "irm-agent", info.ModTime(), f)
	})

	r.Post("/enroll", func(w http.ResponseWriter, r *http.Request) {
		if !g.checkRateLimit(w) {
			return
		}
		rawToken := extractBearerToken(r)
		if _, err := g.store.PeekEnrollToken(r.Context(), rawToken); err != nil {
			if errors.Is(err, storage.ErrEnrollTokenUsed) {
				writeError(w, http.StatusConflict, "enroll_token_used", "该一次性接入令牌已被使用，请重新生成")
				return
			}
			if errors.Is(err, storage.ErrInvalidEnrollToken) {
				g.recordAuthFailure()
				writeError(w, http.StatusUnauthorized, "invalid_enroll_token", "接入令牌无效或已过期")
				return
			}
			internalError(w, err)
			return
		}

		rawBody, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_body", "请求内容过大或无法读取")
			return
		}

		queryOneshot := r.URL.Query().Get("oneshot") == "1" || strings.EqualFold(r.URL.Query().Get("oneshot"), "true")
		var req protocol.EnrollRequest
		trimmed := strings.TrimSpace(string(rawBody))
		if strings.HasPrefix(trimmed, protocol.CompactPrefix) {
			snap, decErr := protocol.DecodeSnapshotPayload(trimmed)
			if decErr != nil {
				writeError(w, http.StatusBadRequest, "invalid_snapshot", "快照格式无效")
				return
			}
			req = protocol.EnrollRequest{
				AgentVersion: "probe-sh",
				Oneshot:      true,
				Snapshot:     snap,
			}
		} else {
			var probe map[string]json.RawMessage
			if err := json.Unmarshal(rawBody, &probe); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_body", "请求 JSON 格式无效")
				return
			}
			if _, hasSnapshot := probe["snapshot"]; hasSnapshot {
				dec := json.NewDecoder(strings.NewReader(trimmed))
				dec.DisallowUnknownFields()
				if err := dec.Decode(&req); err != nil {
					writeError(w, http.StatusBadRequest, "invalid_body", "注册请求字段格式无效")
					return
				}
			} else {
				snap, decErr := protocol.DecodeSnapshotPayload(trimmed)
				if decErr != nil {
					writeError(w, http.StatusBadRequest, "invalid_snapshot", "快照格式无效")
					return
				}
				req = protocol.EnrollRequest{
					AgentVersion: "probe-sh",
					Oneshot:      true,
					Snapshot:     snap,
				}
			}
		}
		if queryOneshot {
			req.Oneshot = true
		}

		fillPublicIPFromRemoteAddr(r, &req.Snapshot, g.trustProxy)
		lookup := enrichSnapshotLookup(r.Context(), g.lookuper, req.Snapshot)

		resp, _, err := g.store.EnrollAgent(r.Context(), rawToken, req, lookup)
		if err != nil {
			if errors.Is(err, storage.ErrEnrollTokenUsed) {
				writeError(w, http.StatusConflict, "enroll_token_used", "该一次性接入令牌已被使用")
				return
			}
			if errors.Is(err, storage.ErrInvalidEnrollToken) {
				g.recordAuthFailure()
				writeError(w, http.StatusUnauthorized, "invalid_enroll_token", "接入令牌无效或已过期")
				return
			}
			resourceError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, resp)
	})

	r.Post("/report", func(w http.ResponseWriter, r *http.Request) {
		if !g.checkRateLimit(w) {
			return
		}
		rawToken := extractBearerToken(r)
		if rawToken == "" {
			g.recordAuthFailure()
			writeError(w, http.StatusUnauthorized, "invalid_agent_token", "缺少探针鉴权令牌")
			return
		}

		var req protocol.ReportRequest
		if !decodeJSONLimit(w, r, &req, 256<<10) {
			return
		}
		fillPublicIPFromRemoteAddr(r, &req.Snapshot, g.trustProxy)

		resp, err := g.store.RecordAgentReport(r.Context(), rawToken, req)
		if err != nil {
			if errors.Is(err, storage.ErrInvalidAgentToken) {
				g.recordAuthFailure()
				writeError(w, http.StatusUnauthorized, "invalid_agent_token", "探针令牌无效或已被吊销")
				return
			}
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	})
}

const probeScriptText = `#!/bin/sh
set -eu

esc() {
  printf '%s' "${1:-}" | tr '\r\n\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

OS_RAW=$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo linux)
KERNEL=$(uname -r 2>/dev/null || echo "")
ARCH_RAW=$(uname -m 2>/dev/null || echo amd64)
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) ARCH="$ARCH_RAW" ;;
esac
HOSTNAME_VAL=$(uname -n 2>/dev/null || hostname 2>/dev/null || echo "node")

OS_PRETTY=""
if [ -r /etc/os-release ]; then
  OS_PRETTY=$(awk -F= '/^PRETTY_NAME=/{gsub(/^"|"$/,"",$2); print $2; exit}' /etc/os-release 2>/dev/null || true)
fi
if [ -z "$OS_PRETTY" ] && command -v sw_vers >/dev/null 2>&1; then
  OS_PRETTY="$(sw_vers -productName 2>/dev/null || true) $(sw_vers -productVersion 2>/dev/null || true)"
fi
if [ -z "$OS_PRETTY" ]; then
  OS_PRETTY="$OS_RAW $KERNEL"
fi

CPU_CORES=1
CPU_MODEL=""
if [ "$OS_RAW" = "darwin" ]; then
  CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 1)
  CPU_MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "")
else
  if command -v nproc >/dev/null 2>&1; then
    CPU_CORES=$(nproc 2>/dev/null || echo 1)
  elif [ -r /proc/cpuinfo ]; then
    CPU_CORES=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)
  fi
  if [ -r /proc/cpuinfo ]; then
    CPU_MODEL=$(awk -F: '/model name|Hardware|Processor/{gsub(/^[ \t]+/,"",$2); print $2; exit}' /proc/cpuinfo 2>/dev/null || true)
  fi
fi

LOAD1=0; LOAD5=0; LOAD15=0; UPTIME_SEC=0
if [ -r /proc/loadavg ]; then
  read -r LOAD1 LOAD5 LOAD15 _ < /proc/loadavg || true
elif [ "$OS_RAW" = "darwin" ]; then
  set -- $(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' || echo "0 0 0")
  LOAD1=${1:-0}; LOAD5=${2:-0}; LOAD15=${3:-0}
fi
if [ -r /proc/uptime ]; then
  UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
fi

MEM_TOTAL=0; MEM_USED=0; SWAP_TOTAL=0; SWAP_USED=0
if [ -r /proc/meminfo ]; then
  eval "$(awk '
    /^MemTotal:/ {mt=$2*1024}
    /^MemAvailable:/ {ma=$2*1024; has_ma=1}
    /^MemFree:/ {mf=$2*1024}
    /^Buffers:/ {mb=$2*1024}
    /^Cached:/ {mc=$2*1024}
    /^SwapTotal:/ {st=$2*1024}
    /^SwapFree:/ {sf=$2*1024}
    END {
      avail = has_ma ? ma : (mf + mb + mc)
      used = (mt > avail) ? (mt - avail) : 0
      sused = (st > sf) ? (st - sf) : 0
      printf "MEM_TOTAL=%.0f MEM_USED=%.0f SWAP_TOTAL=%.0f SWAP_USED=%.0f\n", mt, used, st, sused
    }
  ' /proc/meminfo 2>/dev/null)"
elif [ "$OS_RAW" = "darwin" ]; then
  MEM_TOTAL=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
fi

DISK_TOTAL=0; DISK_USED=0
if df -Pk / >/dev/null 2>&1; then
  eval "$(df -Pk / | awk 'NR==2 {printf "DISK_TOTAL=%.0f DISK_USED=%.0f\n", $2*1024, $3*1024}')"
fi

DISK_TYPE=""
if [ -r /proc/mounts ]; then
  ROOT_DEV=$(awk '$2=="/" && $1 ~ "^/dev/" {sub("^/dev/","",$1); print $1; exit}' /proc/mounts 2>/dev/null || true)
  case "$ROOT_DEV" in
    nvme*) DISK_TYPE="nvme" ;;
    md*) DISK_TYPE="raid" ;;
    *)
      BASE_DEV=$(printf '%s' "$ROOT_DEV" | sed 's/[0-9]*$//')
      if [ -n "$BASE_DEV" ] && [ -r "/sys/block/$BASE_DEV/queue/rotational" ]; then
        ROT=$(cat "/sys/block/$BASE_DEV/queue/rotational" 2>/dev/null || echo "")
        [ "$ROT" = "0" ] && DISK_TYPE="ssd"
        [ "$ROT" = "1" ] && DISK_TYPE="hdd"
      fi
      ;;
  esac
fi

PUB_V4=""; PUB_V6=""; PRIV_IP=""
if command -v ip >/dev/null 2>&1; then
  for addr in $(ip -4 -o addr show scope global 2>/dev/null | awk '$2 !~ /^(docker|br-|veth)/ {sub(/\/.*/,"",$4); print $4}'); do
    case "$addr" in
      10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*|169.254.*|127.*)
        [ -z "$PRIV_IP" ] && PRIV_IP="$addr"
        ;;
      *)
        [ -z "$PUB_V4" ] && PUB_V4="$addr"
        ;;
    esac
  done
  PUB_V6=$(ip -6 -o addr show scope global 2>/dev/null | awk '$2 !~ /^(docker|br-|veth)/ && $4 !~ /^(fe80|fc|fd)/ {sub(/\/.*/,"",$4); print $4; exit}' || true)
elif command -v ifconfig >/dev/null 2>&1; then
  for addr in $(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2}'); do
    case "$addr" in
      10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|100.*|169.254.*)
        [ -z "$PRIV_IP" ] && PRIV_IP="$addr"
        ;;
      *)
        [ -z "$PUB_V4" ] && PUB_V4="$addr"
        ;;
    esac
  done
fi

SSH_PORT=22
if [ -r /etc/ssh/sshd_config ]; then
  P=$(awk 'tolower($1)=="port" && $2 ~ /^[0-9]+$/ {print $2; exit}' /etc/ssh/sshd_config 2>/dev/null || true)
  [ -n "$P" ] && SSH_PORT="$P"
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

JSON=$(printf '{"protocolVersion":1,"collectedAt":"%s","hostname":"%s","os":"%s","osPretty":"%s","kernelVersion":"%s","arch":"%s","cpuModel":"%s","cpuCores":%s,"load1":%s,"load5":%s,"load15":%s,"uptimeSeconds":%s,"memoryUsedBytes":%s,"memoryTotalBytes":%s,"swapUsedBytes":%s,"swapTotalBytes":%s,"rootDiskUsedBytes":%s,"rootDiskTotalBytes":%s,"diskType":"%s","publicIpv4":"%s","publicIpv6":"%s","privateIp":"%s","sshPort":%s}' \
  "$(esc "$TS")" \
  "$(esc "$HOSTNAME_VAL")" \
  "$(esc "$OS_RAW")" \
  "$(esc "$OS_PRETTY")" \
  "$(esc "$KERNEL")" \
  "$(esc "$ARCH")" \
  "$(esc "$CPU_MODEL")" \
  "${CPU_CORES:-1}" \
  "${LOAD1:-0}" "${LOAD5:-0}" "${LOAD15:-0}" \
  "${UPTIME_SEC:-0}" \
  "${MEM_USED:-0}" "${MEM_TOTAL:-0}" \
  "${SWAP_USED:-0}" "${SWAP_TOTAL:-0}" \
  "${DISK_USED:-0}" "${DISK_TOTAL:-0}" \
  "$(esc "$DISK_TYPE")" \
  "$(esc "$PUB_V4")" \
  "$(esc "$PUB_V6")" \
  "$(esc "$PRIV_IP")" \
  "${SSH_PORT:-22}")

if command -v gzip >/dev/null 2>&1; then
  B64=$(printf '%s' "$JSON" | gzip -c | base64 | tr -d '\r\n ')
else
  B64=$(printf '%s' "$JSON" | base64 | tr -d '\r\n ')
fi

printf 'IRM1:%s\n' "$B64"
`

const installScriptText = `#!/bin/sh
set -eu

IRM_URL=""
IRM_TOKEN=""
IRM_INTERVAL="5"
IRM_DOCKER="0"
IRM_ONESHOT="0"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) IRM_URL="${2:-}"; shift 2 ;;
    --token) IRM_TOKEN="${2:-}"; shift 2 ;;
    --interval) IRM_INTERVAL="${2:-5}"; shift 2 ;;
    --docker) IRM_DOCKER="1"; shift 1 ;;
    --oneshot) IRM_ONESHOT="1"; shift 1 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

IRM_URL=$(printf '%s' "$IRM_URL" | sed 's:/*$::')
if [ -z "$IRM_URL" ] || [ -z "$IRM_TOKEN" ]; then
  echo "Usage: install.sh --url <https://irm-host> --token <irm_enroll_...> [--docker] [--oneshot]" >&2
  exit 2
fi

OS_RAW=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH_RAW" >&2; exit 1 ;;
esac

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t irm-agent)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

if [ "$IRM_ONESHOT" = "1" ]; then
  echo "[IRM] Collecting one-shot hardware snapshot..."
  SNAP=$(curl -fsSL "$IRM_URL/agent/v1/probe.sh" | sh)
  curl -fsSL -X POST \
    -H "Authorization: Bearer $IRM_TOKEN" \
    -H "Content-Type: text/plain" \
    --data-binary "$SNAP" \
    "$IRM_URL/agent/v1/enroll?oneshot=1" >/dev/null
  echo "[IRM] Snapshot registered successfully."
  exit 0
fi

echo "[IRM] Downloading irm-agent ($OS_RAW/$ARCH)..."
curl -fsSL "$IRM_URL/agent/v1/binary/$OS_RAW/$ARCH" -o "$TMP_DIR/irm-agent"
curl -fsSL "$IRM_URL/agent/v1/binary/$OS_RAW/$ARCH.sha256" -o "$TMP_DIR/irm-agent.sha256"

EXPECTED_SUM=$(awk '{print $1}' "$TMP_DIR/irm-agent.sha256")
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SUM=$(sha256sum "$TMP_DIR/irm-agent" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SUM=$(shasum -a 256 "$TMP_DIR/irm-agent" | awk '{print $1}')
elif command -v openssl >/dev/null 2>&1; then
  ACTUAL_SUM=$(openssl dgst -sha256 "$TMP_DIR/irm-agent" | awk '{print $NF}')
else
  echo "[IRM] Cannot verify SHA-256: install sha256sum, shasum, or openssl" >&2
  exit 1
fi

if [ "$EXPECTED_SUM" != "$ACTUAL_SUM" ]; then
  echo "[IRM] SHA-256 checksum mismatch! Expected $EXPECTED_SUM, got $ACTUAL_SUM" >&2
  exit 1
fi
chmod 0755 "$TMP_DIR/irm-agent"

if [ "$(id -u)" = "0" ]; then
  BIN_DIR="/usr/local/bin"
  STATE_DIR="/var/lib/irm-agent"
else
  BIN_DIR="$HOME/.local/bin"
  STATE_DIR="$HOME/.config/irm-agent"
fi
mkdir -p "$BIN_DIR" "$STATE_DIR"
chmod 0700 "$STATE_DIR"
cp "$TMP_DIR/irm-agent" "$BIN_DIR/irm-agent"
STATE_FILE="$STATE_DIR/state.json"

DOCKER_FLAG=""
if [ "$IRM_DOCKER" = "1" ]; then
  DOCKER_FLAG="-docker"
fi

echo "[IRM] Enrolling host and reporting initial telemetry..."
# shellcheck disable=SC2086
"$BIN_DIR/irm-agent" enroll -url "$IRM_URL" -token "$IRM_TOKEN" -state "$STATE_FILE" -interval "$IRM_INTERVAL" $DOCKER_FLAG

if [ "$(id -u)" = "0" ] && [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
  cat >/etc/systemd/system/irm-agent.service <<EOF
[Unit]
Description=Internet Resource Manager Outbound Telemetry Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$BIN_DIR/irm-agent run -state $STATE_FILE
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now irm-agent.service
  echo "[IRM] Installed and started systemd service: irm-agent.service"
else
  if [ -f "$STATE_DIR/agent.pid" ]; then
    OLD_PID=$(cat "$STATE_DIR/agent.pid" 2>/dev/null || true)
    [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null || true
  fi
  nohup "$BIN_DIR/irm-agent" run -state "$STATE_FILE" >"$STATE_DIR/agent.log" 2>&1 &
  echo $! >"$STATE_DIR/agent.pid"
  echo "[IRM] Started background agent (PID $(cat "$STATE_DIR/agent.pid")). Log: $STATE_DIR/agent.log"
fi
`
