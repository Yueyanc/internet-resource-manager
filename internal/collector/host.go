package collector

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

func Collect(ctx context.Context) (protocol.Snapshot, error) {
	info, err := host.InfoWithContext(ctx)
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("host info: %w", err)
	}
	memory, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("memory: %w", err)
	}
	root, err := disk.UsageWithContext(ctx, "/")
	if err != nil {
		return protocol.Snapshot{}, fmt.Errorf("root disk: %w", err)
	}
	percent, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err != nil || len(percent) == 0 {
		if err == nil {
			err = fmt.Errorf("no CPU sample returned")
		}
		return protocol.Snapshot{}, fmt.Errorf("cpu: %w", err)
	}
	return protocol.Snapshot{
		ProtocolVersion: 1, CollectedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Hostname: info.Hostname, OS: info.OS, Arch: runtime.GOARCH, UptimeSeconds: info.Uptime,
		CPUPercent: percent[0], MemoryUsedBytes: memory.Used, MemoryTotalBytes: memory.Total,
		RootDiskUsedBytes: root.Used, RootDiskTotalBytes: root.Total,
	}, nil
}
