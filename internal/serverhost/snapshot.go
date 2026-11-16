package serverhost

import (
	"fmt"
	"math"
	"net/netip"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
)

var AgentStatuses = []string{"none", "snapshot", "online", "stale"}

type Telemetry struct {
	AgentStatus        string                      `json:"agentStatus"`
	Mode               string                      `json:"mode"`
	AgentVersion       string                      `json:"agentVersion"`
	IntervalSec        int64                       `json:"intervalSec"`
	EnrolledAt         string                      `json:"enrolledAt"`
	LastReportedAt     string                      `json:"lastReportedAt"`
	CPUModel           string                      `json:"cpuModel"`
	KernelVersion      string                      `json:"kernelVersion"`
	UptimeSeconds      int64                       `json:"uptimeSeconds"`
	CPUPercent         float64                     `json:"cpuPercent"`
	Load1              float64                     `json:"load1"`
	Load5              float64                     `json:"load5"`
	Load15             float64                     `json:"load15"`
	MemoryUsedBytes    int64                       `json:"memoryUsedBytes"`
	MemoryTotalBytes   int64                       `json:"memoryTotalBytes"`
	SwapUsedBytes      int64                       `json:"swapUsedBytes"`
	SwapTotalBytes     int64                       `json:"swapTotalBytes"`
	RootDiskUsedBytes  int64                       `json:"rootDiskUsedBytes"`
	RootDiskTotalBytes int64                       `json:"rootDiskTotalBytes"`
	NetRxBps           int64                       `json:"netRxBps"`
	NetTxBps           int64                       `json:"netTxBps"`
	TrafficCycleKey    string                      `json:"trafficCycleKey"`
	TrafficRxBytes     int64                       `json:"trafficRxBytes"`
	TrafficTxBytes     int64                       `json:"trafficTxBytes"`
	TCPConnections     int64                       `json:"tcpConnections"`
	DockerEnabled      bool                        `json:"dockerEnabled"`
	DockerAvailable    bool                        `json:"dockerAvailable"`
	DockerError        string                      `json:"dockerError"`
	Containers         []protocol.ContainerSummary `json:"containers"`
}

func DefaultTelemetry() Telemetry {
	return Telemetry{
		AgentStatus: "none",
		Containers:  []protocol.ContainerSummary{},
	}
}

// ComputeAgentStatus evaluates telemetry liveness honestly:
// - "none": no agent or snapshot attached
// - "snapshot": one-shot snapshot imported (no heartbeat expected)
// - "online": daemon reported within max(intervalSec*3, 30s)
// - "stale": daemon heartbeat overdue (never reported as confirmed host offline)
func ComputeAgentStatus(mode string, intervalSec int64, lastReportedAt string, now time.Time) string {
	switch mode {
	case "snapshot":
		return "snapshot"
	case "daemon":
		if lastReportedAt == "" {
			return "stale"
		}
		reportedAt, err := time.Parse(time.RFC3339Nano, lastReportedAt)
		if err != nil {
			reportedAt, err = time.Parse(time.RFC3339, lastReportedAt)
			if err != nil {
				return "stale"
			}
		}
		threshold := time.Duration(intervalSec) * 3 * time.Second
		if threshold < 30*time.Second {
			threshold = 30 * time.Second
		}
		if now.Sub(reportedAt) <= threshold {
			return "online"
		}
		return "stale"
	default:
		return "none"
	}
}

func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func effectiveResetDay(year int, month time.Month, resetDay int) int {
	if resetDay <= 0 {
		return 1
	}
	dim := daysInMonth(year, month)
	if resetDay > dim {
		return dim
	}
	return resetDay
}

// ComputeTrafficCycleKey returns the YYYY-MM-DD start date of the active monthly traffic cycle.
func ComputeTrafficCycleKey(now time.Time, resetDay int64) string {
	utc := now.UTC()
	y, m, d := utc.Date()
	r := int(resetDay)
	curReset := effectiveResetDay(y, m, r)
	if d >= curReset {
		return fmt.Sprintf("%04d-%02d-%02d", y, int(m), curReset)
	}
	prev := time.Date(y, m-1, 1, 0, 0, 0, 0, time.UTC)
	py, pm, _ := prev.Date()
	prevReset := effectiveResetDay(py, pm, r)
	return fmt.Sprintf("%04d-%02d-%02d", py, int(pm), prevReset)
}

func ClampUint64ToInt64(v uint64) int64 {
	if v > math.MaxInt64 {
		return math.MaxInt64
	}
	return int64(v)
}

// AccumulateTrafficDelta tracks monthly traffic bytes across reboots and cycle rollovers.
// On initial enrollment (prevCycleKey == "") or cycle rollover, counters start at 0 anchored
// to the current boot counters so pre-existing kernel counters do not falsely inflate quota usage.
func AccumulateTrafficDelta(
	prevCycleKey string,
	prevRx, prevTx, prevBootRx, prevBootTx int64,
	currentCycleKey string,
	snapRx, snapTx uint64,
) (rx, tx, bootRx, bootTx int64) {
	curBootRx := ClampUint64ToInt64(snapRx)
	curBootTx := ClampUint64ToInt64(snapTx)
	if prevCycleKey == "" || prevCycleKey != currentCycleKey {
		return 0, 0, curBootRx, curBootTx
	}

	var deltaRx int64
	if curBootRx >= prevBootRx {
		deltaRx = curBootRx - prevBootRx
	} else {
		// Host rebooted and kernel NIC counter reset to 0.
		deltaRx = curBootRx
	}

	var deltaTx int64
	if curBootTx >= prevBootTx {
		deltaTx = curBootTx - prevBootTx
	} else {
		deltaTx = curBootTx
	}

	return prevRx + deltaRx, prevTx + deltaTx, curBootRx, curBootTx
}

func NormalizeArch(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "amd64", "x86_64", "x64":
		return "amd64"
	case "arm64", "aarch64":
		return "arm64"
	case "":
		return "amd64"
	default:
		return "other"
	}
}

func sanitizeHostname(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	var b strings.Builder
	for i := range len(s) {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_' {
			b.WriteByte(c)
		} else {
			b.WriteByte('-')
		}
		if b.Len() >= 253 {
			break
		}
	}
	out := strings.Trim(b.String(), "-.")
	if !validHostname(out) {
		return ""
	}
	return out
}

func truncateRunes(s string, limit int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= limit {
		return s
	}
	runes := []rune(s)
	return strings.TrimSpace(string(runes[:limit]))
}

func cleanIPv4(raw string) string {
	addr, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil || !addr.Is4() {
		return ""
	}
	return addr.String()
}

func cleanIPv6(raw string) string {
	s := strings.Trim(strings.TrimSpace(raw), "[]")
	addr, err := netip.ParseAddr(s)
	if err != nil || !addr.Is6() || addr.Is4In6() {
		return ""
	}
	return addr.String()
}

func cleanPrivateIP(raw string) string {
	s := strings.Trim(strings.TrimSpace(raw), "[]")
	addr, err := netip.ParseAddr(s)
	if err != nil {
		return ""
	}
	return addr.String()
}

func InferPresetAndProvider(osLabel string, hasPublicIP bool, lookup *ipaddr.LookupResult) (presetKey, provider, kind string) {
	lowerOS := strings.ToLower(osLabel)
	switch {
	case strings.Contains(lowerOS, "proxmox") || strings.Contains(lowerOS, "pve"):
		return "proxmox", "Proxmox VE", "homelab"
	case strings.Contains(lowerOS, "synology") || strings.Contains(lowerOS, "diskstation") || strings.Contains(lowerOS, "dsm"):
		return "synology", "群晖 Synology", "nas"
	case strings.Contains(lowerOS, "unraid"):
		return "unraid", "Unraid", "nas"
	case strings.Contains(lowerOS, "truenas"):
		return "truenas", "TrueNAS", "nas"
	case strings.Contains(lowerOS, "macos") || strings.Contains(lowerOS, "darwin"):
		return "mac_mini", "Apple Mac", "homelab"
	case strings.Contains(lowerOS, "openwrt") || strings.Contains(lowerOS, "immortalwrt"):
		return "homelab", "OpenWrt", "homelab"
	}

	if lookup != nil {
		org := strings.ToLower(lookup.ASNOrg)
		switch {
		case lookup.ASN == 54574 || strings.Contains(org, "dmit"):
			return "dmit", "DMIT", "vps"
		case lookup.ASN == 25820 || strings.Contains(org, "it7") || strings.Contains(org, "bandwagon"):
			return "bandwagon", "搬瓦工", "vps"
		case lookup.ASN == 24940 || lookup.ASN == 213230 || strings.Contains(org, "hetzner"):
			return "hetzner", "Hetzner", "vps"
		case lookup.ASN == 31898 || strings.Contains(org, "oracle"):
			return "oracle", "Oracle Cloud", "vps"
		case lookup.ASN == 16509 || lookup.ASN == 14618 || strings.Contains(org, "amazon") || strings.Contains(org, "aws"):
			return "aws", "AWS", "vps"
		case lookup.ASN == 15169 || lookup.ASN == 396982 || strings.Contains(org, "google"):
			return "gcp", "Google Cloud", "vps"
		case lookup.ASN == 8075 || strings.Contains(org, "microsoft"):
			return "azure", "Azure", "vps"
		case lookup.ASN == 45102 || lookup.ASN == 37963 || strings.Contains(org, "alibaba") || strings.Contains(org, "aliyun"):
			return "aliyun", "阿里云", "vps"
		case lookup.ASN == 132203 || lookup.ASN == 45090 || strings.Contains(org, "tencent"):
			return "tencent_cloud", "腾讯云", "vps"
		case lookup.ASN == 136907 || lookup.ASN == 55990 || strings.Contains(org, "huawei"):
			return "huawei_cloud", "华为云", "vps"
		case lookup.ASN == 20473 || strings.Contains(org, "vultr") || strings.Contains(org, "choopa"):
			return "vultr", "Vultr", "vps"
		case lookup.ASN == 14061 || strings.Contains(org, "digitalocean"):
			return "digitalocean", "DigitalOcean", "vps"
		case lookup.ASN == 63949 || strings.Contains(org, "linode") || strings.Contains(org, "akamai"):
			return "linode", "Akamai / Linode", "vps"
		case lookup.ASN == 16276 || strings.Contains(org, "ovh"):
			return "ovh", "OVHcloud", "vps"
		case lookup.ASN == 51167 || strings.Contains(org, "contabo"):
			return "contabo", "Contabo", "vps"
		case strings.Contains(org, "racknerd"):
			return "racknerd", "RackNerd", "vps"
		case lookup.ASN == 203380 || strings.Contains(org, "alphavps") || strings.Contains(org, "da international"):
			return "alphavps", "AlphaVPS", "vps"
		case strings.Contains(org, "clawcloud"):
			return "clawcloud", "ClawCloud", "vps"
		case strings.Contains(org, "rainyun"):
			return "rainyun", "雨云", "vps"
		}
		if lookup.ASNOrg != "" {
			return "", truncateRunes(lookup.ASNOrg, 80), "vps"
		}
	}

	if !hasPublicIP {
		return "homelab", "", "homelab"
	}
	return "", "", "vps"
}

// BuildInputFromSnapshot merges discovered host facts (and optional RDAP IP enrichment)
// into a new or existing Server Input without overwriting user-curated metadata.
func BuildInputFromSnapshot(
	existing *Input,
	snap protocol.Snapshot,
	lookup *ipaddr.LookupResult,
	nameHint string,
	presetHint string,
) Input {
	osLabel := strings.TrimSpace(snap.OSPretty)
	if osLabel == "" {
		osLabel = strings.TrimSpace(snap.OS)
	}
	osLabel = truncateRunes(osLabel, 100)
	hostname := sanitizeHostname(snap.Hostname)
	arch := NormalizeArch(snap.Arch)
	ipv4 := cleanIPv4(snap.PublicIPv4)
	ipv6 := cleanIPv6(snap.PublicIPv6)
	privIP := cleanPrivateIP(snap.PrivateIP)

	var cpuCores int64
	if snap.CPUCores > 0 && snap.CPUCores <= 1024 {
		cpuCores = int64(snap.CPUCores)
	}
	var memoryMB int64
	if snap.MemoryTotalBytes > 0 {
		mb := (snap.MemoryTotalBytes + 512*1024) / (1024 * 1024)
		if mb == 0 {
			mb = 1
		}
		if mb <= 16777216 {
			memoryMB = int64(mb)
		}
	}
	var diskGB int64
	if snap.RootDiskTotalBytes > 0 {
		gb := (snap.RootDiskTotalBytes + 512*1024*1024) / (1024 * 1024 * 1024)
		if gb == 0 {
			gb = 1
		}
		if gb <= 1048576 {
			diskGB = int64(gb)
		}
	}
	var diskType string
	if slices.Contains(DiskTypes, snap.DiskType) {
		diskType = snap.DiskType
	}
	var sshPort int64
	if snap.SSHPort > 0 && snap.SSHPort <= 65535 {
		sshPort = int64(snap.SSHPort)
	}

	hasPublic := ipv4 != "" || ipv6 != ""
	inferredPreset, inferredProvider, inferredKind := InferPresetAndProvider(osLabel, hasPublic, lookup)

	var lookupRegion, lookupCity string
	if lookup != nil {
		cand := strings.ToUpper(strings.TrimSpace(lookup.Region))
		if validRegion(cand) {
			lookupRegion = cand
		}
		lookupCity = truncateRunes(lookup.City, 100)
	}

	if existing == nil {
		name := truncateRunes(nameHint, 100)
		if name == "" {
			if hostname != "" {
				name = truncateRunes(hostname, 100)
			} else if ipv4 != "" {
				name = ipv4
			} else if privIP != "" {
				name = privIP
			} else if ipv6 != "" {
				name = truncateRunes(ipv6, 100)
			} else {
				name = "Auto-Discovered Node"
			}
		}

		preset := strings.TrimSpace(presetHint)
		if !validPresetKey(preset) {
			preset = ""
		}
		if preset == "" {
			preset = inferredPreset
		}

		region := lookupRegion
		if region == "" {
			if inferredKind == "homelab" || inferredKind == "nas" || !hasPublic {
				region = "LOCAL"
			} else {
				region = "GLOBAL"
			}
		}

		if sshPort == 0 {
			sshPort = 22
		}

		out := Input{
			PresetKey:   preset,
			Name:        name,
			Hostname:    hostname,
			Provider:    inferredProvider,
			Kind:        inferredKind,
			Status:      "active",
			Region:      region,
			Datacenter:  lookupCity,
			OS:          osLabel,
			Arch:        arch,
			CPUCores:    cpuCores,
			MemoryMB:    memoryMB,
			DiskGB:      diskGB,
			DiskType:    diskType,
			TrafficRule: "both",
			IPv4:        ipv4,
			IPv6:        ipv6,
			PrivateIP:   privIP,
			SSHPort:     sshPort,
			DomainIDs:   []string{},
			IPIDs:       []string{},
			Tags:        []string{},
		}
		return out
	}

	out := *existing
	if hostname != "" {
		out.Hostname = hostname
	}
	if osLabel != "" {
		out.OS = osLabel
	}
	if arch != "" {
		out.Arch = arch
	}
	if cpuCores > 0 {
		out.CPUCores = cpuCores
	}
	if memoryMB > 0 {
		out.MemoryMB = memoryMB
	}
	if diskGB > 0 {
		out.DiskGB = diskGB
	}
	if diskType != "" && out.DiskType != "raid" {
		out.DiskType = diskType
	}
	if ipv4 != "" {
		out.IPv4 = ipv4
	}
	if ipv6 != "" {
		out.IPv6 = ipv6
	}
	if privIP != "" {
		out.PrivateIP = privIP
	}
	if out.SSHPort == 0 && sshPort > 0 {
		out.SSHPort = sshPort
	}
	if out.PresetKey == "" {
		if presetHint != "" && validPresetKey(presetHint) {
			out.PresetKey = presetHint
		} else if inferredPreset != "" {
			out.PresetKey = inferredPreset
		}
	}
	if out.Provider == "" && inferredProvider != "" {
		out.Provider = inferredProvider
	}
	if (out.Region == "" || out.Region == "GLOBAL") && lookupRegion != "" {
		out.Region = lookupRegion
	}
	if out.Datacenter == "" && lookupCity != "" {
		out.Datacenter = lookupCity
	}
	return out
}
