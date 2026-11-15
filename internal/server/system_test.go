package server_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
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
	"sync/atomic"
	"testing"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/updater"
)

func makeTarGzAsset(t *testing.T, script string) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	gzw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gzw)
	hdr := &tar.Header{
		Name:     "server",
		Mode:     0755,
		Size:     int64(len(script)),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write([]byte(script)); err != nil {
		t.Fatal(err)
	}
	_ = tw.Close()
	_ = gzw.Close()
	raw := buf.Bytes()
	sum := sha256.Sum256(raw)
	return raw, hex.EncodeToString(sum[:])
}

func TestSystemUpdateAndRollbackHTTPFlow(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	store, err := storage.Open(t.Context(), filepath.Join(dataDir, "irm.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	exePath := filepath.Join(tmp, "app", "server")
	if err := os.MkdirAll(filepath.Dir(exePath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(exePath, []byte("#!/bin/sh\necho v0.1.3\n"), 0755); err != nil {
		t.Fatal(err)
	}

	tarV014, sumV014 := makeTarGzAsset(t, "#!/bin/sh\necho v0.1.4\n")
	tarV012, sumV012 := makeTarGzAsset(t, "#!/bin/sh\necho v0.1.2\n")

	var mockGH *httptest.Server
	mockGH = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/Yueyanc/internet-resource-manager/releases/latest":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tag_name":     "v0.1.4",
				"name":         "v0.1.4",
				"body":         "New release notes",
				"published_at": "2026-11-15T10:00:00Z",
				"html_url":     mockGH.URL + "/releases/tag/v0.1.4",
				"assets": []map[string]any{
					{"name": "irm-release-linux-amd64.tar.gz", "browser_download_url": mockGH.URL + "/dl/v0.1.4.tar.gz", "size": len(tarV014)},
					{"name": "checksums.txt", "browser_download_url": mockGH.URL + "/dl/v0.1.4.sha256", "size": 96},
				},
			})
		case "/repos/Yueyanc/internet-resource-manager/releases":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"tag_name": "v0.1.4", "name": "v0.1.4", "published_at": "2026-11-15T10:00:00Z"},
				{
					"tag_name":     "v0.1.2",
					"name":         "v0.1.2",
					"published_at": "2026-11-13T10:00:00Z",
					"html_url":     mockGH.URL + "/releases/tag/v0.1.2",
					"assets": []map[string]any{
						{"name": "irm-release-linux-amd64.tar.gz", "browser_download_url": mockGH.URL + "/dl/v0.1.2.tar.gz", "size": len(tarV012)},
						{"name": "checksums.txt", "browser_download_url": mockGH.URL + "/dl/v0.1.2.sha256", "size": 96},
					},
				},
			})
		case "/dl/v0.1.4.tar.gz":
			_, _ = w.Write(tarV014)
		case "/dl/v0.1.4.sha256":
			_, _ = fmt.Fprintf(w, "%s  irm-release-linux-amd64.tar.gz\n", sumV014)
		case "/dl/v0.1.2.tar.gz":
			_, _ = w.Write(tarV012)
		case "/dl/v0.1.2.sha256":
			_, _ = fmt.Fprintf(w, "%s  irm-release-linux-amd64.tar.gz\n", sumV012)
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockGH.Close()

	u, _ := url.Parse(mockGH.URL)
	upd := updater.New(updater.Config{
		CurrentVersion:       "v0.1.3",
		BuildType:            "release",
		ImageVersion:         "v0.1.3",
		DataDir:              dataDir,
		ExecutablePath:       exePath,
		Store:                store,
		APIBaseURL:           mockGH.URL,
		AllowedDownloadHosts: []string{u.Hostname()},
		AllowHTTPScheme:      true,
		SkipBinarySmokeCheck: true,
		TargetGOOS:           "linux",
		TargetGOARCH:         "amd64",
	})

	var restarted atomic.Bool
	handler := server.NewHandler(
		store,
		nil,
		server.WithVersion("v0.1.3"),
		server.WithBuildType("release"),
		server.WithUpdater(upd),
		server.WithRestartFunc(func() { restarted.Store(true) }),
	)

	// Unauthenticated call must return 401.
	unauth := httptest.NewRecorder()
	handler.ServeHTTP(unauth, httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/v1/system/check-updates", nil))
	if unauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without session, got %d", unauth.Code)
	}

	var cookie *http.Cookie
	do := func(method, path, body string) *httptest.ResponseRecorder {
		var r *http.Request
		if body == "" {
			r = httptest.NewRequest(method, "http://127.0.0.1"+path, nil)
		} else {
			r = httptest.NewRequest(method, "http://127.0.0.1"+path, strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, r)
		if res := rec.Result(); len(res.Cookies()) > 0 {
			cookie = res.Cookies()[0]
		}
		return rec
	}

	setup := do(http.MethodPost, "/api/v1/auth/setup", `{"username":"admin","password":"correct-horse-battery"}`)
	if setup.Code != http.StatusCreated {
		t.Fatalf("setup failed: %d %s", setup.Code, setup.Body)
	}

	check := do(http.MethodGet, "/api/v1/system/check-updates", "")
	if check.Code != http.StatusOK || !strings.Contains(check.Body.String(), `"hasUpdate":true`) {
		t.Fatalf("expected hasUpdate:true, got %d %s", check.Code, check.Body)
	}

	apply := do(http.MethodPost, "/api/v1/system/update", "")
	if apply.Code != http.StatusOK || !strings.Contains(apply.Body.String(), `"targetVersion":"v0.1.4"`) {
		t.Fatalf("expected update to v0.1.4, got %d %s", apply.Code, apply.Body)
	}

	rbList := do(http.MethodGet, "/api/v1/system/rollback-versions", "")
	if rbList.Code != http.StatusOK || !strings.Contains(rbList.Body.String(), `"v0.1.2"`) {
		t.Fatalf("expected v0.1.2 in rollback-versions, got %d %s", rbList.Code, rbList.Body)
	}

	rb := do(http.MethodPost, "/api/v1/system/rollback", `{"version":"v0.1.2","restoreDatabase":false}`)
	if rb.Code != http.StatusOK || !strings.Contains(rb.Body.String(), `"targetVersion":"v0.1.2"`) {
		t.Fatalf("expected rollback to v0.1.2, got %d %s", rb.Code, rb.Body)
	}

	rst := do(http.MethodPost, "/api/v1/system/restart", "")
	if rst.Code != http.StatusOK {
		t.Fatalf("expected 200 on restart, got %d %s", rst.Code, rst.Body)
	}
	deadline := time.Now().Add(2 * time.Second)
	for !restarted.Load() && time.Now().Before(deadline) {
		time.Sleep(25 * time.Millisecond)
	}
	if !restarted.Load() {
		t.Fatal("expected restart callback to fire")
	}
}
