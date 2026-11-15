package serverhost

import (
	"testing"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
)

func TestComputeAgentStatusHonesty(t *testing.T) {
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)

	if got := ComputeAgentStatus("", 20, "", now); got != "none" {
		t.Fatalf("expected none, got %q", got)
	}
	if got := ComputeAgentStatus("snapshot", 0, "2025-01-01T00:00:00Z", now); got != "snapshot" {
		t.Fatalf("expected snapshot to stay snapshot regardless of age, got %q", got)
	}
	if got := ComputeAgentStatus("daemon", 5, now.Add(-25*time.Second).Format(time.RFC3339), now); got != "online" {
		t.Fatalf("expected online within 30s floor, got %q", got)
	}
	if got := ComputeAgentStatus("daemon", 5, now.Add(-35*time.Second).Format(time.RFC3339), now); got != "stale" {
		t.Fatalf("expected stale past 30s floor for 5s interval, got %q", got)
	}
	if got := ComputeAgentStatus("daemon", 20, now.Add(-60*time.Second).Format(time.RFC3339), now); got != "online" {
		t.Fatalf("expected online at 3x20s=60s threshold, got %q", got)
	}
	if got := ComputeAgentStatus("daemon", 20, now.Add(-120*time.Second).Format(time.RFC3339), now); got != "stale" {
		t.Fatalf("expected stale after threshold, got %q", got)
	}
}

func TestTrafficCycleAndRebootSafeDelta(t *testing.T) {
	midMonth := time.Date(2026, 3, 10, 8, 0, 0, 0, time.UTC)
	if got := ComputeTrafficCycleKey(midMonth, 15); got != "2026-02-15" {
		t.Fatalf("expected Feb 15 cycle start, got %q", got)
	}
	afterReset := time.Date(2026, 3, 18, 8, 0, 0, 0, time.UTC)
	if got := ComputeTrafficCycleKey(afterReset, 15); got != "2026-03-15" {
		t.Fatalf("expected Mar 15 cycle start, got %q", got)
	}
	// Reset day 31 in March before day 31 should clamp February cycle start to Feb 28.
	if got := ComputeTrafficCycleKey(midMonth, 31); got != "2026-02-28" {
		t.Fatalf("expected Feb 28 clamped cycle start, got %q", got)
	}

	// Initial enrollment sets baseline without counting pre-existing boot traffic.
	rx, tx, bootRx, bootTx := AccumulateTrafficDelta("", 0, 0, 0, 0, "2026-03-15", 5000, 8000)
	if rx != 0 || tx != 0 || bootRx != 5000 || bootTx != 8000 {
		t.Fatalf("unexpected initial baseline: rx=%d tx=%d bootRx=%d bootTx=%d", rx, tx, bootRx, bootTx)
	}

	// Subsequent tick accumulates delta.
	rx, tx, bootRx, bootTx = AccumulateTrafficDelta("2026-03-15", rx, tx, bootRx, bootTx, "2026-03-15", 6500, 9200)
	if rx != 1500 || tx != 1200 {
		t.Fatalf("expected rx=1500 tx=1200, got rx=%d tx=%d", rx, tx)
	}

	// Host reboot resets kernel counter to 400 / 300; previous cycle bytes must be preserved!
	rx, tx, bootRx, bootTx = AccumulateTrafficDelta("2026-03-15", rx, tx, bootRx, bootTx, "2026-03-15", 400, 300)
	if rx != 1900 || tx != 1500 || bootRx != 400 || bootTx != 300 {
		t.Fatalf("expected reboot-safe rx=1900 tx=1500, got rx=%d tx=%d", rx, tx)
	}

	// Monthly rollover resets cycle counters cleanly.
	rx, tx, _, _ = AccumulateTrafficDelta("2026-03-15", rx, tx, bootRx, bootTx, "2026-04-15", 900, 700)
	if rx != 0 || tx != 0 {
		t.Fatalf("expected rollover reset to 0, got rx=%d tx=%d", rx, tx)
	}
}

func TestBuildInputFromSnapshotAutoFillsAndPreservesUserEdits(t *testing.T) {
	snap := protocol.Snapshot{
		Hostname:           "hk-edge-01",
		OS:                 "linux",
		OSPretty:           "Debian GNU/Linux 12 (bookworm)",
		Arch:               "x86_64",
		CPUCores:           2,
		MemoryTotalBytes:   2 * 1024 * 1024 * 1024,
		RootDiskTotalBytes: 40 * 1024 * 1024 * 1024,
		DiskType:           "nvme",
		PublicIPv4:         "154.12.34.56",
		PrivateIP:          "100.88.1.9",
		SSHPort:            2222,
	}
	lookup := &ipaddr.LookupResult{
		Region: "HK",
		City:   "Hong Kong",
		ASN:    54574,
		ASNOrg: "DMIT Cloud Services",
	}

	created := BuildInputFromSnapshot(nil, snap, lookup, "", "")
	if err := created.Validate(); err != nil {
		t.Fatalf("expected auto-built input to pass validation: %v", err)
	}
	if created.PresetKey != "dmit" || created.Provider != "DMIT" || created.Region != "HK" || created.Datacenter != "Hong Kong" {
		t.Fatalf("unexpected provider/region inference: %+v", created)
	}
	if created.CPUCores != 2 || created.MemoryMB != 2048 || created.DiskGB != 40 || created.DiskType != "nvme" || created.SSHPort != 2222 {
		t.Fatalf("unexpected hardware mapping: %+v", created)
	}

	// Updating an existing server preserves custom Name, Notes, DiskType=raid, and TrafficGB.
	custom := created
	custom.Name = "主力香港节点"
	custom.DiskType = "raid"
	custom.TrafficGB = 1000
	custom.Notes = "CN2 GIA"

	snap2 := snap
	snap2.MemoryTotalBytes = 4 * 1024 * 1024 * 1024
	updated := BuildInputFromSnapshot(&custom, snap2, nil, "", "")
	if updated.Name != "主力香港节点" || updated.DiskType != "raid" || updated.TrafficGB != 1000 || updated.Notes != "CN2 GIA" {
		t.Fatalf("user fields were overwritten: %+v", updated)
	}
	if updated.MemoryMB != 4096 {
		t.Fatalf("expected refreshed RAM 4096 MB, got %d", updated.MemoryMB)
	}
}
