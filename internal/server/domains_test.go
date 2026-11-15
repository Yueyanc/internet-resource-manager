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

func TestDomainLifecycleAndLinks(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "domains.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	handler := server.NewHandler(store, nil)

	var cookie *http.Cookie
	call := func(method, path string, payload any) (*httptest.ResponseRecorder, map[string]any) {
		t.Helper()
		var body string
		if payload != nil {
			raw, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			body = string(raw)
		}
		r := httptest.NewRequest(method, "http://localhost:8787/api/v1"+path, strings.NewReader(body))
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		var parsed map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &parsed)
		return w, parsed
	}

	setupW, _ := call("POST", "/auth/setup", map[string]string{
		"username": "admin",
		"password": "test-only-password",
	})
	if setupW.Code != http.StatusCreated {
		t.Fatalf("setup failed: %d %s", setupW.Code, setupW.Body.String())
	}
	cookie = setupW.Result().Cookies()[0]

	createW, created := call("POST", "/domains", map[string]any{
		"presetKey":     "cloudflare",
		"name":          "CraftStudio.IO.",
		"registrar":     "Cloudflare",
		"dnsProvider":   "Cloudflare DNS",
		"purpose":       "prod",
		"status":        "active",
		"expireDate":    "2027-05-20",
		"autoRenew":     true,
		"whoisPrivacy":  true,
		"icpStatus":     "verified",
		"icpNumber":     "沪ICP备20260001号-1",
		"managementUrl": "https://dash.cloudflare.com/",
		"tags":          []string{"主力官网", "CDN"},
		"notes":         "At-cost renewal",
		"createSubscription": map[string]any{
			"presetKey":    "cloudflare",
			"name":         "craftstudio.io 域名续费",
			"amountMinor":  1044,
			"currency":     "USD",
			"cycle":        "yearly",
			"intervalDays": 365,
			"dueDate":      "2027-05-20",
			"category":     "cloud",
			"renewalMode":  "auto",
			"intention":    "keep",
		},
	})
	if createW.Code != http.StatusCreated {
		t.Fatalf("create domain failed: %d %s", createW.Code, createW.Body.String())
	}
	id, _ := created["id"].(string)
	if created["name"] != "craftstudio.io" || created["subscriptionId"] == "" || id == "" {
		t.Fatalf("unexpected created domain: %+v", created)
	}

	updateW, updated := call("PUT", "/domains/"+id, map[string]any{
		"presetKey":    "porkbun",
		"name":         "craftstudio.io",
		"registrar":    "Porkbun",
		"dnsProvider":  "Cloudflare DNS",
		"purpose":      "mail",
		"status":       "parked",
		"expireDate":   "2028-05-20",
		"autoRenew":    false,
		"whoisPrivacy": true,
		"icpStatus":    "none",
		"archived":     true,
		"notes":        "Transferred to Porkbun",
	})
	if updateW.Code != http.StatusOK {
		t.Fatalf("update domain failed: %d %s", updateW.Code, updateW.Body.String())
	}
	if updated["registrar"] != "Porkbun" || updated["autoRenew"] != false || updated["icpNumber"] != "" || updated["archived"] != true {
		t.Fatalf("unexpected updated domain: %+v", updated)
	}

	countsW, counts := call("GET", "/nav-counts", nil)
	if countsW.Code != http.StatusOK || counts["domains"] != float64(0) {
		t.Fatalf("archived domain should not count in active domains: %+v", counts)
	}
}
