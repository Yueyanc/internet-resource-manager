/**
 * Builds the 100% self-contained read-only POSIX shell one-liner for zero-callback snapshot collection.
 * Works on Linux (Debian/Ubuntu/Alpine/RHEL/Proxmox/Synology/OpenWrt) and macOS without installing anything
 * and without requiring any outbound network connection back to IRM.
 */
export function buildZeroCallbackProbeCommand(withDocker = false): string {
  const scriptLines = [
    String.raw`set -eu`,
    String.raw`esc(){ printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'; }`,
    String.raw`OS_RAW=$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo linux)`,
    String.raw`KERNEL=$(uname -r 2>/dev/null || true)`,
    String.raw`ARCH_RAW=$(uname -m 2>/dev/null || echo amd64)`,
    String.raw`case "$ARCH_RAW" in x86_64|amd64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; *) ARCH="$ARCH_RAW";; esac`,
    String.raw`HN=$(uname -n 2>/dev/null || hostname 2>/dev/null || echo node)`,
    String.raw`OSP=""; [ -r /etc/os-release ] && OSP=$(awk -F= '/^PRETTY_NAME=/{gsub(/^"|"$/,"",$2);print $2;exit}' /etc/os-release 2>/dev/null || true)`,
    String.raw`[ -z "$OSP" ] && command -v sw_vers >/dev/null 2>&1 && OSP="$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"`,
    String.raw`[ -z "$OSP" ] && OSP="$OS_RAW $KERNEL"`,
    String.raw`CORES=1; MODEL=""`,
    String.raw`if [ "$OS_RAW" = darwin ]; then CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 1); MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || true); else if command -v nproc >/dev/null 2>&1; then CORES=$(nproc); else CORES=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1); fi; [ -r /proc/cpuinfo ] && MODEL=$(awk -F: '/model name|Hardware|Processor/{gsub(/^[ \t]+/,"",$2);print $2;exit}' /proc/cpuinfo 2>/dev/null || true); fi`,
    String.raw`L1=0; L5=0; L15=0; UP=0`,
    String.raw`[ -r /proc/loadavg ] && read -r L1 L5 L15 _ </proc/loadavg || true`,
    String.raw`[ -r /proc/uptime ] && UP=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)`,
    String.raw`MT=0; MU=0; ST=0; SU=0`,
    String.raw`if [ -r /proc/meminfo ]; then eval "$(awk '/^MemTotal:/{mt=$2*1024}/^MemAvailable:/{ma=$2*1024;ha=1}/^MemFree:/{mf=$2*1024}/^Buffers:/{mb=$2*1024}/^Cached:/{mc=$2*1024}/^SwapTotal:/{st=$2*1024}/^SwapFree:/{sf=$2*1024}END{av=ha?ma:(mf+mb+mc);printf "MT=%.0f MU=%.0f ST=%.0f SU=%.0f",mt,(mt>av?mt-av:0),st,(st>sf?st-sf:0)}' /proc/meminfo)"; elif [ "$OS_RAW" = darwin ]; then MT=$(sysctl -n hw.memsize 2>/dev/null || echo 0); fi`,
    String.raw`DT=0; DU=0; df -Pk / >/dev/null 2>&1 && eval "$(df -Pk / | awk 'NR==2{printf "DT=%.0f DU=%.0f",$2*1024,$3*1024}')"`,
    String.raw`DTYPE=""; if [ -r /proc/mounts ]; then RDEV=$(awk '$2=="/"&&$1~/^\/dev\//{sub("^/dev/","",$1);print $1;exit}' /proc/mounts); case "$RDEV" in nvme*) DTYPE=nvme;; md*) DTYPE=raid;; *) BDEV=$(printf '%s' "$RDEV"|sed 's/[0-9]*$//'); [ -n "$BDEV" ] && [ -r "/sys/block/$BDEV/queue/rotational" ] && { ROT=$(cat "/sys/block/$BDEV/queue/rotational"); [ "$ROT" = 0 ] && DTYPE=ssd; [ "$ROT" = 1 ] && DTYPE=hdd; } || true;; esac; fi`,
    String.raw`V4=""; V6=""; PIP=""`,
    String.raw`if command -v ip >/dev/null 2>&1; then for a in $(ip -4 -o addr show scope global 2>/dev/null | awk '$2!~/^(docker|br-|veth)/{sub(/\/.*/,"",$4);print $4}'); do case "$a" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*|169.254.*|127.*) [ -z "$PIP" ] && PIP="$a";; *) [ -z "$V4" ] && V4="$a";; esac; done; V6=$(ip -6 -o addr show scope global 2>/dev/null | awk '$2!~/^(docker|br-|veth)/&&$4!~/^(fe80|fc|fd)/{sub(/\/.*/,"",$4);print $4;exit}' || true); elif command -v ifconfig >/dev/null 2>&1; then for a in $(ifconfig 2>/dev/null | awk '/inet /&&$2!="127.0.0.1"{print $2}'); do case "$a" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|100.*|169.254.*) [ -z "$PIP" ] && PIP="$a";; *) [ -z "$V4" ] && V4="$a";; esac; done; fi`,
    String.raw`SP=22; [ -r /etc/ssh/sshd_config ] && { P=$(awk 'tolower($1)=="port"&&$2~/^[0-9]+$/{print $2;exit}' /etc/ssh/sshd_config || true); [ -n "$P" ] && SP="$P"; }`,
    withDocker
      ? String.raw`DK_AVAIL=false; DK_ERR=""; DK_JSON="[]"; if command -v docker >/dev/null 2>&1; then if OUT=$(docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.Label "com.docker.compose.project"}}' 2>/dev/null); then DK_AVAIL=true; DK_JSON=$(printf '%s\n' "$OUT" | awk -F'|' 'NF>=5 {gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); items = items (n++?",":"") sprintf("{\"id\":\"%s\",\"name\":\"%s\",\"image\":\"%s\",\"state\":\"%s\",\"status\":\"%s\",\"composeProject\":\"%s\"}", substr($1,1,12), $2, $3, $4, $5, $6)} END {printf "[%s]", items}'); else DK_ERR="docker_denied_or_stopped"; fi; else DK_ERR="docker_not_installed"; fi`
      : String.raw`DK_AVAIL=false; DK_ERR=""; DK_JSON="[]"`,
    `JS=$(printf '{"protocolVersion":1,"hostname":"%s","os":"%s","osPretty":"%s","kernelVersion":"%s","arch":"%s","cpuModel":"%s","cpuCores":%s,"load1":%s,"load5":%s,"load15":%s,"uptimeSeconds":%s,"memoryUsedBytes":%s,"memoryTotalBytes":%s,"swapUsedBytes":%s,"swapTotalBytes":%s,"rootDiskUsedBytes":%s,"rootDiskTotalBytes":%s,"diskType":"%s","publicIpv4":"%s","publicIpv6":"%s","privateIp":"%s","sshPort":%s,"dockerEnabled":${withDocker ? 'true' : 'false'},"dockerAvailable":%s,"dockerError":"%s","containers":%s}' "$(esc "$HN")" "$(esc "$OS_RAW")" "$(esc "$OSP")" "$(esc "$KERNEL")" "$(esc "$ARCH")" "$(esc "$MODEL")" "$CORES" "$L1" "$L5" "$L15" "$UP" "$MU" "$MT" "$SU" "$ST" "$DU" "$DT" "$(esc "$DTYPE")" "$(esc "$V4")" "$(esc "$V6")" "$(esc "$PIP")" "$SP" "$DK_AVAIL" "$(esc "$DK_ERR")" "$DK_JSON")`,
    String.raw`if command -v gzip >/dev/null 2>&1; then B64=$(printf '%s' "$JS" | gzip -c | base64 | tr -d '\r\n '); else B64=$(printf '%s' "$JS" | base64 | tr -d '\r\n '); fi`,
    String.raw`printf '\nIRM1:%s\n' "$B64"`,
  ];

  const fullScript = scriptLines.join('; ');
  return `sh -c ${shellSingleQuote(fullScript)}`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildDaemonInstallCommand(
  endpointUrl: string,
  enrollToken: string,
  dockerEnabled: boolean,
): string {
  const cleanUrl = endpointUrl.trim().replace(/\/+$/, '');
  const flags = [
    `--url ${shellSingleQuote(cleanUrl)}`,
    `--token ${shellSingleQuote(enrollToken)}`,
    ...(dockerEnabled ? ['--docker'] : []),
  ].join(' ');
  return `curl -fsSL ${shellSingleQuote(`${cleanUrl}/agent/v1/install.sh`)} | sh -s -- ${flags}`;
}

export function buildLocalSshPipeCommand(
  sshTarget: string,
  localOrigin: string,
  enrollToken: string,
): string {
  const cleanOrigin = localOrigin.trim().replace(/\/+$/, '');
  const target = sshTarget.trim() || 'root@YOUR_SERVER_IP';
  return `curl -fsSL ${shellSingleQuote(`${cleanOrigin}/agent/v1/probe.sh`)} | ssh ${target} 'sh -s' | curl -fsSL -X POST -H ${shellSingleQuote(`Authorization: Bearer ${enrollToken}`)} --data-binary @- ${shellSingleQuote(`${cleanOrigin}/agent/v1/enroll?oneshot=1`)}`;
}

export function isLoopbackEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }
  catch {
    return false;
  }
}
