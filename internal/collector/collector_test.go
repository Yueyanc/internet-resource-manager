package collector_test

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/collector"
)

func TestCollectHostSnapshotAndMockDockerSocket(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	snap, err := collector.CollectWithOptions(ctx, collector.Options{
		SampleDuration: 50 * time.Millisecond,
		CollectDocker:  false,
	})
	if err != nil {
		t.Fatalf("CollectWithOptions: %v", err)
	}
	if snap.Hostname == "" || snap.CPUCores <= 0 || snap.MemoryTotalBytes == 0 || snap.RootDiskTotalBytes == 0 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
	if snap.DockerEnabled {
		t.Fatal("docker must be disabled by default")
	}

	// Mock Unix domain socket simulating Docker Engine /containers/json?all=1
	// Use /tmp short path so macOS 104-char sun_path limit is never exceeded.
	sockDir, err := os.MkdirTemp("/tmp", "irm-dck-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })
	sockPath := filepath.Join(sockDir, "d.sock")

	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("unix listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/containers/json" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"Id":"abcdef1234567890","Names":["/caddy-proxy"],"Image":"caddy:2.8","State":"running","Status":"Up 5 days","Labels":{"com.docker.compose.project":"edge","com.docker.compose.service":"caddy"}},
				{"Id":"9876543210fedcba","Names":["/backup-job"],"Image":"restic/restic:latest","State":"exited","Status":"Exited (0) 2 hours ago","Labels":{}}
			]`))
		}),
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Shutdown(context.Background()) })

	containers, err := collector.CollectDockerContainers(ctx, sockPath)
	if err != nil {
		t.Fatalf("CollectDockerContainers: %v", err)
	}
	if len(containers) != 2 || containers[0].Name != "caddy-proxy" || containers[0].ComposeProject != "edge" || containers[0].ID != "abcdef123456" {
		t.Fatalf("unexpected containers: %+v", containers)
	}

	// Missing socket returns explicit error, never fake empty list
	if _, err := collector.CollectDockerContainers(ctx, filepath.Join(sockDir, "missing.sock")); err == nil {
		t.Fatal("missing socket must return error")
	}
}
