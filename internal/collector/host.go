package collector

import (
	"bufio"
	"context"
	"fmt"
	stdnet "net"
	"net/netip"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	psnet "github.com/shirou/gopsutil/v4/net"
)

type Options struct {
	SampleDuration time.Duration
	CollectDocker  bool
	DockerSocket   string
}

func Collect(ctx context.Context) (protocol.Snapshot, error) {
	return CollectWithOptions(ctx, Options{SampleDuration: 500 * time.Millisecond})
}

func CollectWithOptions(ctx context.Context, opts Options) (protocol.Snapshot, error) {
	sampleDur := opts.SampleDuration
	if sampleDur <= 0 {
		sampleDur = 350 * time.Millisecond
	}

	info, err := host.InfoWithContext(ctx)
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("host info: %w", err)
	}
	memory, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("memory: %w", err)
	}
	swap, _ := mem.SwapMemoryWithContext(ctx)
	root, err := disk.UsageWithContext(ctx, "/")
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("root disk: %w", err)
	}
	percent, err := cpu.PercentWithContext(ctx, sampleDur, false)
	if err != nil || len(percent) == 0 {
		if err == nil {
			err = fmt.Errorf("no CPU sample returned")
		}
		return protocol.Snapshot{}, fmt.Errorf("cpu: %w", err)
	}

	cores, _ := cpu.CountsWithContext(ctx, true)
	if cores <= 0 {
		cores = runtime.NumCPU()
	}
	var cpuModel string
	if cpuInfos, infoErr := cpu.InfoWithContext(ctx); infoErr == nil && len(cpuInfos) > 0 {
		cpuModel = strings.TrimSpace(cpuInfos[0].ModelName)
	}

	var load1, load5, load15 float64
	if avg, loadErr := load.AvgWithContext(ctx); loadErr == nil && avg != nil {
		load1 = avg.Load1
		load5 = avg.Load5
		load15 = avg.Load15
	}

	var swapUsed, swapTotal uint64
	if swap != nil {
		swapUsed = swap.Used
		swapTotal = swap.Total
	}

	rxBytes, txBytes := collectNetTotals(ctx)
	pubV4, pubV6, privIP := detectIPAddresses()

	snap := protocol.Snapshot{
		ProtocolVersion:    1,
		CollectedAt:        time.Now().UTC().Format(time.RFC3339Nano),
		Hostname:           info.Hostname,
		OS:                 info.OS,
		OSPretty:           formatPrettyOS(info),
		KernelVersion:      info.KernelVersion,
		Arch:               normalizeArch(runtime.GOARCH),
		CPUModel:           cpuModel,
		CPUCores:           cores,
		CPUPercent:         percent[0],
		Load1:              load1,
		Load5:              load5,
		Load15:             load15,
		UptimeSeconds:      info.Uptime,
		MemoryUsedBytes:    memory.Used,
		MemoryTotalBytes:   memory.Total,
		SwapUsedBytes:      swapUsed,
		SwapTotalBytes:     swapTotal,
		RootDiskUsedBytes:  root.Used,
		RootDiskTotalBytes: root.Total,
		DiskType:           detectRootDiskType(),
		NetRxBytes:         rxBytes,
		NetTxBytes:         txBytes,
		TCPConnections:     countLinuxTCPConnections(),
		PublicIPv4:         pubV4,
		PublicIPv6:         pubV6,
		PrivateIP:          privIP,
		SSHPort:            detectSSHPort(),
		DockerEnabled:      opts.CollectDocker,
	}

	if opts.CollectDocker {
		socketPath := opts.DockerSocket
		if socketPath == "" {
			socketPath = DefaultDockerSocket
		}
		containers, dockerErr := CollectDockerContainers(ctx, socketPath)
		if dockerErr != nil {
			snap.DockerAvailable = false
			snap.DockerError = dockerErr.Error()
		} else {
			snap.DockerAvailable = true
			snap.Containers = containers
		}
	}

	return snap, nil
}

func normalizeArch(goarch string) string {
	switch goarch {
	case "amd64", "386":
		return "amd64"
	case "arm64", "arm":
		return "arm64"
	default:
		return "other"
	}
}

func formatPrettyOS(info *host.InfoStat) string {
	if info == nil {
		return ""
	}
	platform := strings.TrimSpace(info.Platform)
	version := strings.TrimSpace(info.PlatformVersion)
	switch strings.ToLower(platform) {
	case "darwin":
		platform = "macOS"
	case "ubuntu":
		platform = "Ubuntu"
	case "debian":
		platform = "Debian"
	case "alpine":
		platform = "Alpine Linux"
	case "rocky":
		platform = "Rocky Linux"
	case "almalinux":
		platform = "AlmaLinux"
	case "centos":
		platform = "CentOS"
	case "arch":
		platform = "Arch Linux"
	default:
		if len(platform) > 1 {
			platform = strings.ToUpper(platform[:1]) + platform[1:]
		}
	}
	if platform != "" && version != "" {
		return platform + " " + version
	}
	if platform != "" {
		return platform
	}
	return info.OS
}

func collectNetTotals(ctx context.Context) (rx, tx uint64) {
	counters, err := psnet.IOCountersWithContext(ctx, true)
	if err != nil {
		return 0, 0
	}
	for _, c := range counters {
		name := strings.ToLower(c.Name)
		if name == "lo" || strings.HasPrefix(name, "lo") ||
			strings.HasPrefix(name, "veth") ||
			strings.HasPrefix(name, "docker") ||
			strings.HasPrefix(name, "br-") ||
			strings.HasPrefix(name, "cni") ||
			strings.HasPrefix(name, "virbr") {
			continue
		}
		rx += c.BytesRecv
		tx += c.BytesSent
	}
	return rx, tx
}

var cgnatPrefix = netip.MustParsePrefix("100.64.0.0/10")

func detectIPAddresses() (pubV4, pubV6, privIP string) {
	ifaces, err := stdnet.Interfaces()
	if err != nil {
		return "", "", ""
	}
	var lanFallback string
	for _, iface := range ifaces {
		if iface.Flags&stdnet.FlagUp == 0 || iface.Flags&stdnet.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(iface.Name)
		if strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "br-") {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, raw := range addrs {
			var stdIP stdnet.IP
			switch v := raw.(type) {
			case *stdnet.IPNet:
				stdIP = v.IP
			case *stdnet.IPAddr:
				stdIP = v.IP
			}
			if len(stdIP) == 0 {
				continue
			}
			addr, ok := netip.AddrFromSlice(stdIP)
			if !ok {
				continue
			}
			addr = addr.Unmap()
			if addr.IsLoopback() || addr.IsLinkLocalUnicast() || addr.IsMulticast() || addr.IsUnspecified() {
				continue
			}
			if ipaddr.IsPublicRoutable(addr) {
				if addr.Is4() && pubV4 == "" {
					pubV4 = addr.String()
				} else if addr.Is6() && pubV6 == "" {
					pubV6 = addr.String()
				}
				continue
			}
			if addr.Is4() {
				if cgnatPrefix.Contains(addr) && privIP == "" {
					privIP = addr.String()
				} else if addr.IsPrivate() && lanFallback == "" {
					lanFallback = addr.String()
				}
			}
		}
	}
	if privIP == "" {
		privIP = lanFallback
	}
	return pubV4, pubV6, privIP
}

func detectRootDiskType() string {
	if runtime.GOOS != "linux" {
		return ""
	}
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return ""
	}
	defer f.Close()

	var rootDev string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 && fields[1] == "/" && strings.HasPrefix(fields[0], "/dev/") {
			rootDev = filepath.Base(fields[0])
			break
		}
	}
	if rootDev == "" {
		return ""
	}
	if strings.HasPrefix(rootDev, "nvme") {
		return "nvme"
	}
	if strings.HasPrefix(rootDev, "md") {
		return "raid"
	}

	// Strip partition digits (e.g. sda1 -> sda, vda2 -> vda, mmcblk0p2 -> mmcblk0)
	base := rootDev
	if strings.HasPrefix(base, "mmcblk") {
		if idx := strings.LastIndex(base, "p"); idx > 6 {
			base = base[:idx]
		}
	} else {
		base = strings.TrimRight(base, "0123456789")
	}
	if base == "" {
		return ""
	}
	rotBytes, err := os.ReadFile(filepath.Join("/sys/block", base, "queue/rotational"))
	if err != nil {
		return ""
	}
	switch strings.TrimSpace(string(rotBytes)) {
	case "0":
		return "ssd"
	case "1":
		return "hdd"
	default:
		return ""
	}
}

func countLinuxTCPConnections() int {
	if runtime.GOOS != "linux" {
		return 0
	}
	total := 0
	for _, path := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		lines := 0
		for scanner.Scan() {
			lines++
		}
		_ = f.Close()
		if lines > 1 {
			total += lines - 1
		}
	}
	return total
}

func detectSSHPort() int {
	f, err := os.Open("/etc/ssh/sshd_config")
	if err != nil {
		return 22
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.EqualFold(fields[0], "Port") {
			if port, convErr := strconv.Atoi(fields[1]); convErr == nil && port > 0 && port <= 65535 {
				return port
			}
		}
	}
	return 22
}
