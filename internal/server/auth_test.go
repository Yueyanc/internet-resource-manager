package server_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/auth"
	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

func TestAuthenticationLifecycle(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	call := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if got := call("GET", "/subscriptions", "").Code; got != 401 {
		t.Fatalf("private resources: %d", got)
	}
	if got := call("POST", "/auth/setup", `{"username":"admin","password":"123"}`).Code; got != 400 {
		t.Fatalf("weak password: %d", got)
	}
	w := call("POST", "/auth/setup", `{"username":"admin","password":"test-only-password"}`)
	if w.Code != 201 {
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
	cookie = w.Result().Cookies()[0]
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("unsafe cookie")
	}
	if got := call("GET", "/subscriptions", "").Code; got != 200 {
		t.Fatalf("authenticated: %d", got)
	}
	if got := call("POST", "/auth/setup", `{"username":"other","password":"test-only-password"}`).Code; got != 409 {
		t.Fatalf("repeat setup: %d", got)
	}
	if got := call("POST", "/auth/logout", "").Code; got != 200 {
		t.Fatalf("logout: %d", got)
	}
	if got := call("GET", "/subscriptions", "").Code; got != 401 {
		t.Fatalf("revoked cookie: %d", got)
	}
	cookie = nil
	if got := call("POST", "/auth/login", `{"username":"admin","password":"wrong"}`).Code; got != 401 {
		t.Fatalf("bad login: %d", got)
	}
	if got := call("POST", "/auth/login", `{"username":"admin","password":"test-only-password"}`).Code; got != 200 {
		t.Fatalf("login: %d", got)
	}
	for range 5 {
		call("POST", "/auth/login", `{"username":"admin","password":"wrong"}`)
	}
	if got := call("POST", "/auth/login", `{"username":"admin","password":"wrong"}`).Code; got != 429 {
		t.Fatalf("throttle: %d", got)
	}
}

func TestBootstrapAdministratorAndTrustedReverseProxy(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "proxy.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	created, err := store.BootstrapAdministrator(t.Context(), "opsadmin", auth.HashPassword("test-only-strong-pass"))
	if err != nil || !created {
		t.Fatalf("expected bootstrap creation, got created=%v err=%v", created, err)
	}
	createdAgain, err := store.BootstrapAdministrator(t.Context(), "otheradmin", auth.HashPassword("another-strong-pass"))
	if err != nil || createdAgain {
		t.Fatalf("expected second bootstrap to no-op, got created=%v err=%v", createdAgain, err)
	}

	origins, err := server.ParseAllowedOrigins("https://irm.example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := server.ParseAllowedOrigins("ftp://bad.example.com/path"); err == nil {
		t.Fatal("expected invalid origin error")
	}

	handler := server.NewHandler(
		store,
		nil,
		server.WithAllowedOrigins(origins),
		server.WithTrustedProxy(true),
		server.WithVersion("v0.1.0"),
	)

	// Setup must be rejected with 409 because bootstrap already created the admin.
	setupReq := httptest.NewRequest(http.MethodPost, "http://irm.example.com/api/v1/auth/setup", strings.NewReader(`{"username":"hacker","password":"test-only-password"}`))
	setupReq.RemoteAddr = "127.0.0.1:43210"
	setupReq.Header.Set("Content-Type", "application/json")
	setupReq.Header.Set("Origin", "https://irm.example.com")
	setupReq.Header.Set("X-Forwarded-Proto", "https")
	setupResp := httptest.NewRecorder()
	handler.ServeHTTP(setupResp, setupReq)
	if setupResp.Code != http.StatusConflict {
		t.Fatalf("expected 409 on setup after bootstrap, got %d %s", setupResp.Code, setupResp.Body)
	}

	// Login via reverse-proxied HTTPS origin succeeds and sets Secure cookie.
	loginReq := httptest.NewRequest(http.MethodPost, "http://irm.example.com/api/v1/auth/login", strings.NewReader(`{"username":"opsadmin","password":"test-only-strong-pass"}`))
	loginReq.RemoteAddr = "127.0.0.1:43210"
	loginReq.Header.Set("Content-Type", "application/json")
	loginReq.Header.Set("Origin", "https://irm.example.com")
	loginReq.Header.Set("X-Forwarded-Proto", "https")
	loginResp := httptest.NewRecorder()
	handler.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("reverse-proxy login failed: %d %s", loginResp.Code, loginResp.Body)
	}
	cookies := loginResp.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatalf("expected Secure HttpOnly session cookie behind trusted proxy, got %+v", cookies)
	}

	// Untrusted Host or untrusted Origin must still be rejected with 403.
	badHost := httptest.NewRequest(http.MethodGet, "http://evil.example.com/api/v1/health", nil)
	badHostResp := httptest.NewRecorder()
	handler.ServeHTTP(badHostResp, badHost)
	if badHostResp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on untrusted Host, got %d", badHostResp.Code)
	}

	badOrigin := httptest.NewRequest(http.MethodPost, "http://irm.example.com/api/v1/auth/logout", nil)
	badOrigin.Header.Set("Origin", "https://evil.example.com")
	badOriginResp := httptest.NewRecorder()
	handler.ServeHTTP(badOriginResp, badOrigin)
	if badOriginResp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on cross-origin write, got %d", badOriginResp.Code)
	}
}
