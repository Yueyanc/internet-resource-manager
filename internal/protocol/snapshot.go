package protocol

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const CompactPrefix = "IRM1:"

var ErrInvalidSnapshot = errors.New("invalid snapshot payload")

type ContainerSummary struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Image          string `json:"image"`
	State          string `json:"state"`
	Status         string `json:"status"`
	ComposeProject string `json:"composeProject,omitempty"`
	ComposeService string `json:"composeService,omitempty"`
}

type Snapshot struct {
	ProtocolVersion    int                `json:"protocolVersion"`
	CollectedAt        string             `json:"collectedAt"`
	Hostname           string             `json:"hostname"`
	OS                 string             `json:"os"`
	OSPretty           string             `json:"osPretty"`
	KernelVersion      string             `json:"kernelVersion"`
	Arch               string             `json:"arch"`
	CPUModel           string             `json:"cpuModel"`
	CPUCores           int                `json:"cpuCores"`
	CPUPercent         float64            `json:"cpuPercent"`
	Load1              float64            `json:"load1"`
	Load5              float64            `json:"load5"`
	Load15             float64            `json:"load15"`
	UptimeSeconds      uint64             `json:"uptimeSeconds"`
	MemoryUsedBytes    uint64             `json:"memoryUsedBytes"`
	MemoryTotalBytes   uint64             `json:"memoryTotalBytes"`
	SwapUsedBytes      uint64             `json:"swapUsedBytes"`
	SwapTotalBytes     uint64             `json:"swapTotalBytes"`
	RootDiskUsedBytes  uint64             `json:"rootDiskUsedBytes"`
	RootDiskTotalBytes uint64             `json:"rootDiskTotalBytes"`
	DiskType           string             `json:"diskType"`
	NetRxBytes         uint64             `json:"netRxBytes"`
	NetTxBytes         uint64             `json:"netTxBytes"`
	NetRxBps           uint64             `json:"netRxBps"`
	NetTxBps           uint64             `json:"netTxBps"`
	TCPConnections     int                `json:"tcpConnections"`
	PublicIPv4         string             `json:"publicIpv4"`
	PublicIPv6         string             `json:"publicIpv6"`
	PrivateIP          string             `json:"privateIp"`
	SSHPort            int                `json:"sshPort"`
	DockerEnabled      bool               `json:"dockerEnabled"`
	DockerAvailable    bool               `json:"dockerAvailable"`
	DockerError        string             `json:"dockerError,omitempty"`
	Containers         []ContainerSummary `json:"containers,omitempty"`
}

type EnrollRequest struct {
	AgentVersion string   `json:"agentVersion"`
	IntervalSec  int      `json:"intervalSec"`
	Oneshot      bool     `json:"oneshot,omitempty"`
	Snapshot     Snapshot `json:"snapshot"`
}

type EnrollResponse struct {
	ServerID    string `json:"serverId"`
	ServerName  string `json:"serverName"`
	AgentToken  string `json:"agentToken,omitempty"`
	IntervalSec int    `json:"intervalSec"`
	Mode        string `json:"mode"`
}

type ReportRequest struct {
	AgentVersion string   `json:"agentVersion"`
	IntervalSec  int      `json:"intervalSec"`
	Snapshot     Snapshot `json:"snapshot"`
}

type ReportResponse struct {
	Accepted    bool `json:"accepted"`
	IntervalSec int  `json:"intervalSec"`
}

func EncodeCompactSnapshot(snap Snapshot) (string, error) {
	raw, err := json.Marshal(snap)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	gz, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return "", err
	}
	if _, err := gz.Write(raw); err != nil {
		_ = gz.Close()
		return "", err
	}
	if err := gz.Close(); err != nil {
		return "", err
	}
	return CompactPrefix + base64.RawURLEncoding.EncodeToString(buf.Bytes()), nil
}

// DecodeSnapshotPayload accepts either raw Snapshot JSON or an "IRM1:<base64>" token
// (supporting both gzip-compressed and plain JSON base64 payloads from POSIX shell scripts).
func DecodeSnapshotPayload(payload string) (Snapshot, error) {
	trimmed := strings.TrimSpace(payload)
	if trimmed == "" {
		return Snapshot{}, ErrInvalidSnapshot
	}

	// If multi-line terminal output was pasted, locate the IRM1: token line if present.
	if !strings.HasPrefix(trimmed, "{") {
		for line := range strings.SplitSeq(trimmed, "\n") {
			line = strings.TrimSpace(line)
			if idx := strings.Index(line, CompactPrefix); idx >= 0 {
				trimmed = line[idx:]
				break
			}
		}
	}

	var jsonBytes []byte
	if strings.HasPrefix(trimmed, CompactPrefix) {
		encoded := strings.TrimSpace(strings.TrimPrefix(trimmed, CompactPrefix))
		encoded = strings.Map(func(r rune) rune {
			if r == '\r' || r == '\n' || r == ' ' || r == '\t' {
				return -1
			}
			return r
		}, encoded)
		decoded, err := decodeAnyBase64(encoded)
		if err != nil || len(decoded) == 0 {
			return Snapshot{}, fmt.Errorf("%w: base64 decode failed", ErrInvalidSnapshot)
		}
		if len(decoded) >= 2 && decoded[0] == 0x1f && decoded[1] == 0x8b {
			zr, err := gzip.NewReader(bytes.NewReader(decoded))
			if err != nil {
				return Snapshot{}, fmt.Errorf("%w: invalid gzip stream", ErrInvalidSnapshot)
			}
			defer zr.Close()
			limited, err := io.ReadAll(io.LimitReader(zr, 256<<10))
			if err != nil {
				return Snapshot{}, fmt.Errorf("%w: gzip read failed", ErrInvalidSnapshot)
			}
			jsonBytes = limited
		} else {
			jsonBytes = decoded
		}
	} else {
		if len(trimmed) > 256<<10 {
			return Snapshot{}, ErrInvalidSnapshot
		}
		jsonBytes = []byte(trimmed)
	}

	var snap Snapshot
	if err := json.Unmarshal(jsonBytes, &snap); err != nil {
		return Snapshot{}, fmt.Errorf("%w: %v", ErrInvalidSnapshot, err)
	}
	if strings.TrimSpace(snap.Hostname) == "" && strings.TrimSpace(snap.OS) == "" && snap.CPUCores <= 0 && snap.MemoryTotalBytes == 0 {
		return Snapshot{}, ErrInvalidSnapshot
	}
	if snap.ProtocolVersion <= 0 {
		snap.ProtocolVersion = 1
	}
	return snap, nil
}

func decodeAnyBase64(s string) ([]byte, error) {
	for _, enc := range []*base64.Encoding{
		base64.RawURLEncoding,
		base64.URLEncoding,
		base64.RawStdEncoding,
		base64.StdEncoding,
	} {
		if b, err := enc.DecodeString(s); err == nil {
			return b, nil
		}
	}
	return nil, ErrInvalidSnapshot
}
