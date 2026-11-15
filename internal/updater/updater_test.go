package updater

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

func buildTestTarGz(t *testing.T, files map[string]string) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	gzw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gzw)
	for name, content := range files {
		hdr := &tar.Header{
			Name:     name,
			Mode:     0755,
			Size:     int64(len(content)),
			Typeflag: tar.TypeReg,
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzw.Close(); err != nil {
		t.Fatal(err)
	}
	raw := buf.Bytes()
	sum := sha256.Sum256(raw)
	return raw, hex.EncodeToString(sum[:])
}

func TestCompareVersions(t *testing.T) {
	if CompareVersions("0.1.0-dev", "v0.1.0") >= 0 {
		t.Fatal("expected 0.1.0-dev < v0.1.0")
	}
	if CompareVersions("v0.1.3", "v0.1.3") != 0 {
		t.Fatal("expected v0.1.3 == v0.1.3")
	}
	if CompareVersions("v0.1.3", "v0.1.4") >= 0 {
		t.Fatal("expected v0.1.3 < v0.1.4")
	}
	if CompareVersions("v0.2.0", "v0.1.99") <= 0 {
		t.Fatal("expected v0.2.0 > v0.1.99")
	}
}

func TestFullUpdateRollbackAndSQLiteSnapshotLifecycle(t *testing.T) {
	ctx := context.Background()
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	dbPath := filepath.Join(dataDir, "irm.db")

	store, err := storage.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	// Seed a domain before upgrading from v0.1.3 -> v0.1.4.
	_, err = store.SaveDomain(ctx, "", domainname.Input{
		Name:      "before-upgrade.example.com",
		Purpose:   "prod",
		Status:    "active",
		ICPStatus: "none",
	})
	if err != nil {
		t.Fatal(err)
	}

	initialExe := filepath.Join(tmp, "app", "server")
	if err := os.MkdirAll(filepath.Dir(initialExe), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(initialExe, []byte("#!/bin/sh\necho v0.1.3\n"), 0755); err != nil {
		t.Fatal(err)
	}

	archiveV014, sumV014 := buildTestTarGz(t, map[string]string{
		"server":                     "#!/bin/sh\necho v0.1.4\n",
		"dist/irm-agent-linux-amd64": "agent-v0.1.4-amd64",
	})
	archiveV012, sumV012 := buildTestTarGz(t, map[string]string{
		"server": "#!/bin/sh\necho v0.1.2\n",
	})
	tamperChecksum := false

	var ghServer *httptest.Server
	ghServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/Yueyanc/internet-resource-manager/releases/latest":
			_ = json.NewEncoder(w).Encode(githubRelease{
				TagName:     "v0.1.4",
				Name:        "Release v0.1.4",
				Body:        "## Highlights\n- Self-updater & rollback",
				PublishedAt: "2026-11-15T10:00:00Z",
				HTMLURL:     ghServer.URL + "/releases/tag/v0.1.4",
				Assets: []githubAsset{
					{Name: "irm-release-linux-amd64.tar.gz", BrowserDownloadURL: ghServer.URL + "/download/v0.1.4/irm-release-linux-amd64.tar.gz", Size: int64(len(archiveV014))},
					{Name: "checksums.txt", BrowserDownloadURL: ghServer.URL + "/download/v0.1.4/checksums.txt", Size: 96},
				},
			})
		case "/repos/Yueyanc/internet-resource-manager/releases":
			_ = json.NewEncoder(w).Encode([]githubRelease{
				{TagName: "v0.1.4", Name: "v0.1.4", PublishedAt: "2026-11-15T10:00:00Z"},
				{TagName: "v0.1.4-rc1", Prerelease: true},
				{TagName: "v0.1.3", Name: "v0.1.3", PublishedAt: "2026-11-14T10:00:00Z"},
				{
					TagName:     "v0.1.2",
					Name:        "v0.1.2",
					PublishedAt: "2026-11-13T10:00:00Z",
					HTMLURL:     ghServer.URL + "/releases/tag/v0.1.2",
					Assets: []githubAsset{
						{Name: "irm-release-linux-amd64.tar.gz", BrowserDownloadURL: ghServer.URL + "/download/v0.1.2/irm-release-linux-amd64.tar.gz", Size: int64(len(archiveV012))},
						{Name: "checksums.txt", BrowserDownloadURL: ghServer.URL + "/download/v0.1.2/checksums.txt", Size: 96},
					},
				},
				{TagName: "v0.1.1", Name: "v0.1.1", PublishedAt: "2026-11-12T10:00:00Z"},
				{TagName: "v0.1.0", Name: "v0.1.0", PublishedAt: "2026-11-11T10:00:00Z"},
			})
		case "/download/v0.1.4/irm-release-linux-amd64.tar.gz":
			_, _ = w.Write(archiveV014)
		case "/download/v0.1.4/checksums.txt":
			hash := sumV014
			if tamperChecksum {
				hash = strings.Repeat("0", 64)
			}
			_, _ = fmt.Fprintf(w, "%s  irm-release-linux-amd64.tar.gz\n", hash)
		case "/download/v0.1.2/irm-release-linux-amd64.tar.gz":
			_, _ = w.Write(archiveV012)
		case "/download/v0.1.2/checksums.txt":
			_, _ = fmt.Fprintf(w, "%s  irm-release-linux-amd64.tar.gz\n", sumV012)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ghServer.Close()

	parsedHost, _ := url.Parse(ghServer.URL)
	svc := New(Config{
		CurrentVersion:       "v0.1.3",
		BuildType:            "release",
		ImageVersion:         "v0.1.3",
		DataDir:              dataDir,
		ExecutablePath:       initialExe,
		Store:                store,
		APIBaseURL:           ghServer.URL,
		AllowedDownloadHosts: []string{parsedHost.Hostname()},
		AllowHTTPScheme:      true,
		SkipBinarySmokeCheck: true,
		TargetGOOS:           "linux",
		TargetGOARCH:         "amd64",
	})

	// 1. CheckUpdate detects v0.1.4.
	check, err := svc.CheckUpdate(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if !check.HasUpdate || check.LatestVersion != "v0.1.4" || check.DeploymentMode != "docker" || !check.CanSelfUpdate {
		t.Fatalf("unexpected CheckUpdate result: %+v", check)
	}

	// 2. Checksum mismatch must abort update before touching target binary.
	tamperChecksum = true
	if _, err := svc.PerformUpdate(ctx); err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("expected checksum mismatch error, got %v", err)
	}
	tamperChecksum = false

	// 3. PerformUpdate creates SQLite backup, writes /data/bin/server, agent dist, and .backup.
	upRes, err := svc.PerformUpdate(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if upRes.TargetVersion != "v0.1.4" || !upRes.NeedRestart {
		t.Fatalf("unexpected PerformUpdate result: %+v", upRes)
	}
	installedRaw, err := os.ReadFile(filepath.Join(dataDir, "bin", "server"))
	if err != nil || !strings.Contains(string(installedRaw), "v0.1.4") {
		t.Fatalf("expected v0.1.4 binary in overlay, got %q (%v)", string(installedRaw), err)
	}
	agentRaw, err := os.ReadFile(filepath.Join(dataDir, "bin", "dist", "irm-agent-linux-amd64"))
	if err != nil || string(agentRaw) != "agent-v0.1.4-amd64" {
		t.Fatalf("expected bundled agent binary to be updated, got %q (%v)", string(agentRaw), err)
	}

	// Simulate post-restart running v0.1.4 and writing a new domain after upgrade.
	_, err = store.SaveDomain(ctx, "", domainname.Input{
		Name:      "after-upgrade.example.com",
		Purpose:   "prod",
		Status:    "active",
		ICPStatus: "none",
	})
	if err != nil {
		t.Fatal(err)
	}

	svcV014 := New(Config{
		CurrentVersion:       "v0.1.4",
		BuildType:            "release",
		ImageVersion:         "v0.1.3",
		DataDir:              dataDir,
		ExecutablePath:       filepath.Join(dataDir, "bin", "server"),
		Store:                store,
		APIBaseURL:           ghServer.URL,
		AllowedDownloadHosts: []string{parsedHost.Hostname()},
		AllowHTTPScheme:      true,
		SkipBinarySmokeCheck: true,
		TargetGOOS:           "linux",
		TargetGOARCH:         "amd64",
	})

	// 4. ListRollbackVersions returns [v0.1.3, v0.1.2, v0.1.1] (max 3 older stable) and flags v0.1.3 DB backup!
	rbList, err := svcV014.ListRollbackVersions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(rbList.Versions) != 3 || rbList.Versions[0].Version != "v0.1.3" || !rbList.Versions[0].HasDBBackup {
		t.Fatalf("unexpected rollback list: %+v", rbList)
	}
	if !rbList.LocalBackup.Available || rbList.LocalBackup.Version != "v0.1.3" || !rbList.LocalBackup.HasDBBackup {
		t.Fatalf("expected local backup v0.1.3 with DB snapshot, got %+v", rbList.LocalBackup)
	}

	// 5. Specific version rollback to v0.1.2 works and rejects v0.1.0 (beyond top 3).
	if _, err := svcV014.Rollback(ctx, "v0.1.0", false); err != ErrRollbackVersionNotAllowed {
		t.Fatalf("expected ErrRollbackVersionNotAllowed for v0.1.0, got %v", err)
	}
	rbSpecific, err := svcV014.Rollback(ctx, "v0.1.2", false)
	if err != nil || rbSpecific.TargetVersion != "v0.1.2" {
		t.Fatalf("expected rollback to v0.1.2, got %+v (%v)", rbSpecific, err)
	}
	installedV012, _ := os.ReadFile(filepath.Join(dataDir, "bin", "server"))
	if !strings.Contains(string(installedV012), "v0.1.2") {
		t.Fatalf("expected v0.1.2 binary after rollback, got %q", string(installedV012))
	}

	// 6. Rollback to v0.1.3 WITH restoreDatabase=true stages irm.db.restore, and ApplyPendingRestore reverts DB cleanly!
	if err := os.WriteFile(filepath.Join(dataDir, "bin", "server.backup"), []byte("#!/bin/sh\necho v0.1.3\n"), 0755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dataDir, "bin", "backup-meta.json"), []byte(`{"version":"v0.1.3"}`), 0600)

	rbLocal, err := svcV014.Rollback(ctx, "", true)
	if err != nil || !rbLocal.RestoredDatabase || rbLocal.TargetVersion != "v0.1.3" {
		t.Fatalf("expected local rollback with DB restore, got %+v (%v)", rbLocal, err)
	}

	// Simulate server shutdown + pre-open ApplyPendingRestore on restart.
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	applied, err := storage.ApplyPendingRestore(dbPath)
	if err != nil || !applied {
		t.Fatalf("expected ApplyPendingRestore to apply staged snapshot, got applied=%v err=%v", applied, err)
	}

	reopened, err := storage.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	domains, err := reopened.ListDomains(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(domains) != 1 || domains[0].Domain.Name != "before-upgrade.example.com" {
		t.Fatalf("expected database restored to pre-upgrade state (1 domain), got %+v", domains)
	}
}
