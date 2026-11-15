package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

func TestHealthReportsActualDatabaseAndUnimplementedCapabilities(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	handler := server.NewHandler(store, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/v1/health", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("health status = %d: %s", response.Code, response.Body)
	}
	var body struct {
		Database     string `json:"database"`
		Capabilities struct {
			Auth         bool `json:"auth"`
			DomainLookup bool `json:"domainLookup"`
			AgentIngest  bool `json:"agentIngest"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Database != "ok" || !body.Capabilities.Auth || body.Capabilities.DomainLookup || !body.Capabilities.AgentIngest {
		t.Fatalf("unexpected health: %+v", body)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/v1/health", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed database must be unavailable, got %d", response.Code)
	}
}

func TestDomainLifecyclePersistsAndValidatesInput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "127.0.0.1:8787"
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	setup := request("POST", "/api/v1/auth/setup", `{"username":"admin","password":"test-only-password"}`)
	if setup.Code != 201 {
		t.Fatalf("setup: %s", setup.Body)
	}
	cookie = setup.Result().Cookies()[0]
	if body := request("GET", "/api/v1/domains", "").Body.String(); body != "{\"items\":[]}\n" {
		t.Fatalf("new database is not empty: %s", body)
	}
	created := request("POST", "/api/v1/domains", `{"name":" EXAMPLE.com. ","notes":" personal "}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body)
	}
	var value struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Notes string `json:"notes"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	if value.Name != "example.com" || value.Notes != "personal" || value.ID == "" {
		t.Fatalf("unexpected record: %+v", value)
	}
	if got := request("POST", "/api/v1/domains", `{"name":"example.com"}`).Code; got != http.StatusConflict {
		t.Fatalf("duplicate status = %d", got)
	}
	for _, body := range []string{`{"name":"https://example.com"}`, `{"name":"b.com","unknown":true}`, `{"name":"b.com"}{}`, `null`, `{"name":"b.com","notes":"` + strings.Repeat("a", 2001) + `"}`} {
		if got := request("POST", "/api/v1/domains", body).Code; got != http.StatusBadRequest {
			t.Fatalf("invalid body %q status = %d", body, got)
		}
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	handler = server.NewHandler(store, nil)
	listed := request("GET", "/api/v1/domains", "")
	if listed.Code != http.StatusOK || !strings.Contains(listed.Body.String(), value.ID) {
		t.Fatalf("record did not persist: %s", listed.Body)
	}
	if got := request("DELETE", "/api/v1/domains/"+value.ID, "").Code; got != http.StatusOK {
		t.Fatalf("delete status = %d", got)
	}
	if got := request("DELETE", "/api/v1/domains/"+value.ID, "").Code; got != http.StatusNotFound {
		t.Fatalf("second delete status = %d", got)
	}
	if got := request("GET", "/api/v1/missing", "").Code; got != http.StatusNotFound {
		t.Fatalf("missing API status = %d", got)
	}
}

func TestRejectsCrossOriginWrites(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	r := httptest.NewRequest("POST", "http://localhost:8787/api/v1/domains", strings.NewReader(`{"name":"example.com"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://untrusted.example")
	w := httptest.NewRecorder()
	server.NewHandler(store, nil).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-origin status = %d", w.Code)
	}
}

func TestRejectsNonLocalHostBeforeAuthenticationExists(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	r := httptest.NewRequest("GET", "http://untrusted.example/api/v1/domains", nil)
	w := httptest.NewRecorder()
	server.NewHandler(store, nil).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-local Host status = %d", w.Code)
	}
}
