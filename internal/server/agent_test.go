package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

type stubLookuper struct {
	results map[string]ipaddr.LookupResult
}

func (s stubLookuper) Lookup(_ context.Context, parsed ipaddr.ParsedAddress) (ipaddr.LookupResult, error) {
	if r, ok := s.results[parsed.Canonical]; ok {
		return r, nil
	}
	return ipaddr.LookupResult{}, ipaddr.ErrLookupFailed
}

func TestAgentEnrollmentReportingSnapshotAndRevocation(t *testing.T) {
	binDir := t.TempDir()
	fakeBinPath := filepath.Join(binDir, "irm-agent-"+runtime.GOOS+"-"+runtime.GOARCH)
	if err := os.WriteFile(fakeBinPath, []byte("#!/bin/sh\necho irm-agent-mock\n"), 0755); err != nil {
		t.Fatal(err)
	}

	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	lookuper := stubLookuper{
		results: map[string]ipaddr.LookupResult{
			"154.12.34.56": {
				Address: "154.12.34.56",
				Region:  "HK",
				City:    "Hong Kong",
				ASN:     54574,
				ASNOrg:  "DMIT Cloud Services",
			},
		},
	}

	handler := server.NewHandler(
		store,
		nil,
		server.WithIPServices(lookuper, nil),
		server.WithAgentBinaryDir(binDir),
	)

	var cookie *http.Cookie
	adminReq := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "127.0.0.1:8787"
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	agentReq := func(method, path, bearer, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		// Verify /agent/v1 works over Tailscale / non-loopback Host while /api/v1 stays localOnly.
		r.Host = "irm-hub.tailnet.ts.net:8787"
		r.RemoteAddr = "154.12.34.56:54321"
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	setup := adminReq(http.MethodPost, "/api/v1/auth/setup", `{"username":"admin","password":"test-only-password"}`)
	if setup.Code != http.StatusCreated {
		t.Fatalf("setup failed: %d %s", setup.Code, setup.Body)
	}
	cookie = setup.Result().Cookies()[0]

	// 1. Verify binary & sha256 download endpoints.
	binResp := agentReq(http.MethodGet, "/agent/v1/binary/"+runtime.GOOS+"/"+runtime.GOARCH, "", "")
	if binResp.Code != http.StatusOK || binResp.Header().Get("X-Checksum-Sha256") == "" {
		t.Fatalf("binary download failed: %d", binResp.Code)
	}
	sumResp := agentReq(http.MethodGet, "/agent/v1/binary/"+runtime.GOOS+"/"+runtime.GOARCH+".sha256", "", "")
	if sumResp.Code != http.StatusOK || !strings.HasPrefix(sumResp.Body.String(), binResp.Header().Get("X-Checksum-Sha256")) {
		t.Fatalf("checksum endpoint mismatch: %d %q", sumResp.Code, sumResp.Body.String())
	}

	// 2. Execute real POSIX probe.sh in /bin/sh and verify DecodeSnapshotPayload parses its IRM1: token!
	probeResp := agentReq(http.MethodGet, "/agent/v1/probe.sh", "", "")
	if probeResp.Code != http.StatusOK {
		t.Fatalf("probe.sh status = %d", probeResp.Code)
	}
	cmd := exec.Command("/bin/sh", "-c", probeResp.Body.String())
	probeOut, err := cmd.Output()
	if err != nil {
		t.Fatalf("executing probe.sh failed: %v", err)
	}
	parsedProbe, err := protocol.DecodeSnapshotPayload(string(probeOut))
	if err != nil {
		t.Fatalf("probe.sh output %q failed DecodeSnapshotPayload: %v", string(probeOut), err)
	}
	if parsedProbe.CPUCores <= 0 || parsedProbe.MemoryTotalBytes == 0 || parsedProbe.RootDiskTotalBytes == 0 {
		t.Fatalf("probe.sh returned incomplete hardware specs: %+v", parsedProbe)
	}

	// 3. Create one-time enrollment token via admin API.
	tokCreate := adminReq(http.MethodPost, "/api/v1/servers/enroll-tokens", `{"dockerEnabled":true}`)
	if tokCreate.Code != http.StatusCreated {
		t.Fatalf("create enroll token: %d %s", tokCreate.Code, tokCreate.Body)
	}
	var createdTok struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(tokCreate.Body.Bytes(), &createdTok); err != nil {
		t.Fatal(err)
	}

	// Status should initially be "pending".
	pollPending := adminReq(http.MethodGet, "/api/v1/servers/enroll-tokens/"+createdTok.ID, "")
	if !strings.Contains(pollPending.Body.String(), `"status":"pending"`) {
		t.Fatalf("expected pending token status: %s", pollPending.Body)
	}

	// 4. Enroll daemon agent (simulating cloud VPC host with private IP only -> RemoteAddr fills PublicIPv4 + RDAP enriches DMIT HK!).
	enrollPayload, _ := json.Marshal(protocol.EnrollRequest{
		AgentVersion: "0.2.0",
		IntervalSec:  20,
		Snapshot: protocol.Snapshot{
			Hostname:           "hk-cn2-01",
			OS:                 "linux",
			OSPretty:           "Debian GNU/Linux 12 (bookworm)",
			KernelVersion:      "6.1.0-26-amd64",
			Arch:               "x86_64",
			CPUModel:           "AMD EPYC 7763",
			CPUCores:           2,
			CPUPercent:         14.5,
			Load1:              0.22,
			Load5:              0.18,
			Load15:             0.11,
			UptimeSeconds:      86400,
			MemoryUsedBytes:    768 * 1024 * 1024,
			MemoryTotalBytes:   2048 * 1024 * 1024,
			RootDiskUsedBytes:  8 * 1024 * 1024 * 1024,
			RootDiskTotalBytes: 40 * 1024 * 1024 * 1024,
			DiskType:           "nvme",
			NetRxBytes:         1_000_000_000,
			NetTxBytes:         2_000_000_000,
			PrivateIP:          "100.90.1.5",
			SSHPort:            22022,
			DockerEnabled:      true,
			DockerAvailable:    true,
			Containers: []protocol.ContainerSummary{
				{ID: "a1b2c3d4e5f6", Name: "caddy", Image: "caddy:2", State: "running", Status: "Up 2 days", ComposeProject: "edge"},
			},
		},
	})
	enrollResp := agentReq(http.MethodPost, "/agent/v1/enroll", createdTok.Token, string(enrollPayload))
	if enrollResp.Code != http.StatusOK {
		t.Fatalf("enroll failed: %d %s", enrollResp.Code, enrollResp.Body)
	}
	var enrolled protocol.EnrollResponse
	if err := json.Unmarshal(enrollResp.Body.Bytes(), &enrolled); err != nil {
		t.Fatal(err)
	}
	if enrolled.ServerID == "" || enrolled.AgentToken == "" || enrolled.Mode != "daemon" {
		t.Fatalf("unexpected enroll response: %+v", enrolled)
	}

	// Reusing the same enroll token must return 409 Conflict.
	reuse := agentReq(http.MethodPost, "/agent/v1/enroll", createdTok.Token, string(enrollPayload))
	if reuse.Code != http.StatusConflict {
		t.Fatalf("expected 409 on token reuse, got %d", reuse.Code)
	}

	// Polling token status now returns "used" + auto-populated server DTO!
	pollUsed := adminReq(http.MethodGet, "/api/v1/servers/enroll-tokens/"+createdTok.ID, "")
	if pollUsed.Code != http.StatusOK || !strings.Contains(pollUsed.Body.String(), `"status":"used"`) || !strings.Contains(pollUsed.Body.String(), `"presetKey":"dmit"`) {
		t.Fatalf("expected used token with enriched DMIT server: %s", pollUsed.Body)
	}

	// 5. Periodic /agent/v1/report updates live CPU, Bps, and accumulates cycle traffic delta.
	reportPayload, _ := json.Marshal(protocol.ReportRequest{
		AgentVersion: "0.2.0",
		IntervalSec:  20,
		Snapshot: protocol.Snapshot{
			Hostname:           "hk-cn2-01",
			OS:                 "linux",
			OSPretty:           "Debian GNU/Linux 12 (bookworm)",
			KernelVersion:      "6.1.0-26-amd64",
			Arch:               "amd64",
			CPUModel:           "AMD EPYC 7763",
			CPUCores:           2,
			CPUPercent:         42.8,
			Load1:              0.85,
			MemoryUsedBytes:    1024 * 1024 * 1024,
			MemoryTotalBytes:   2048 * 1024 * 1024,
			RootDiskUsedBytes:  9 * 1024 * 1024 * 1024,
			RootDiskTotalBytes: 40 * 1024 * 1024 * 1024,
			DiskType:           "nvme",
			NetRxBytes:         1_250_000_000, // +250 MB delta
			NetTxBytes:         2_500_000_000, // +500 MB delta
			NetRxBps:           12_500_000,
			NetTxBps:           25_000_000,
			TCPConnections:     64,
			PublicIPv4:         "154.12.34.56",
			PrivateIP:          "100.90.1.5",
			DockerEnabled:      true,
			DockerAvailable:    true,
			Containers: []protocol.ContainerSummary{
				{ID: "a1b2c3d4e5f6", Name: "caddy", Image: "caddy:2", State: "running", Status: "Up 2 days", ComposeProject: "edge"},
			},
		},
	})
	repResp := agentReq(http.MethodPost, "/agent/v1/report", enrolled.AgentToken, string(reportPayload))
	if repResp.Code != http.StatusOK {
		t.Fatalf("report failed: %d %s", repResp.Code, repResp.Body)
	}

	listResp := adminReq(http.MethodGet, "/api/v1/servers", "")
	if !strings.Contains(listResp.Body.String(), `"agentStatus":"online"`) ||
		!strings.Contains(listResp.Body.String(), `"trafficRxBytes":250000000`) ||
		!strings.Contains(listResp.Body.String(), `"trafficTxBytes":500000000`) ||
		!strings.Contains(listResp.Body.String(), `"caddy"`) {
		t.Fatalf("expected online telemetry, traffic deltas, and container in server list: %s", listResp.Body)
	}

	// 6. Zero-callback IRM1: snapshot import via /api/v1/servers/import-snapshot.
	compactToken, err := protocol.EncodeCompactSnapshot(protocol.Snapshot{
		Hostname:           "pve-home-01",
		OS:                 "linux",
		OSPretty:           "Proxmox Virtual Environment 8.3",
		Arch:               "amd64",
		CPUCores:           8,
		MemoryTotalBytes:   32 * 1024 * 1024 * 1024,
		RootDiskTotalBytes: 512 * 1024 * 1024 * 1024,
		DiskType:           "nvme",
		PrivateIP:          "192.168.50.10",
	})
	if err != nil {
		t.Fatal(err)
	}
	impBody, _ := json.Marshal(map[string]string{"payload": compactToken})
	impResp := adminReq(http.MethodPost, "/api/v1/servers/import-snapshot", string(impBody))
	if impResp.Code != http.StatusCreated ||
		!strings.Contains(impResp.Body.String(), `"presetKey":"proxmox"`) ||
		!strings.Contains(impResp.Body.String(), `"agentStatus":"snapshot"`) {
		t.Fatalf("import snapshot failed: %d %s", impResp.Code, impResp.Body)
	}

	// 7. Revoke daemon credential -> subsequent /agent/v1/report must fail with 401!
	revResp := adminReq(http.MethodDelete, "/api/v1/servers/"+enrolled.ServerID+"/agent", "")
	if revResp.Code != http.StatusOK || !strings.Contains(revResp.Body.String(), `"agentStatus":"none"`) {
		t.Fatalf("revoke agent failed: %d %s", revResp.Code, revResp.Body)
	}
	afterRevoke := agentReq(http.MethodPost, "/agent/v1/report", enrolled.AgentToken, string(reportPayload))
	if afterRevoke.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after revocation, got %d", afterRevoke.Code)
	}
}
