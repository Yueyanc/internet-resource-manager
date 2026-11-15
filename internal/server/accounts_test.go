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

func TestAccountsLifecycleRelationsAndCheckin(t *testing.T) {
	path := filepath.Join(t.TempDir(), "accounts.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	call := func(method, target string, body any) *httptest.ResponseRecorder {
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+target, strings.NewReader(string(data)))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	setup := call("POST", "/auth/setup", map[string]string{"username": "admin", "password": "test-only-password"})
	if setup.Code != 201 {
		t.Fatal(setup.Body)
	}
	cookie = setup.Result().Cookies()[0]

	// 1. Create a root email hub account (overseas Gmail)
	hubReq := map[string]any{
		"presetKey":      "gmail",
		"platform":       " Gmail ",
		"label":          " 主力身份邮箱 ",
		"identifier":     " main@example.invalid ",
		"category":       "email",
		"ecosystem":      "overseas",
		"region":         "global",
		"role":           "hub",
		"status":         "active",
		"authMethod":     "passkey",
		"twoFactor":      "passkey",
		"recoveryCodes":  "saved",
		"phoneHint":      "+86 *8812",
		"vaultReference": "1Password · Personal / Google Main",
		"securityUrl":    "https://myaccount.google.com/security",
	}
	hubRes := call("POST", "/accounts", hubReq)
	if hubRes.Code != 201 {
		t.Fatalf("create hub %d %s", hubRes.Code, hubRes.Body)
	}
	var hub map[string]any
	if err := json.Unmarshal(hubRes.Body.Bytes(), &hub); err != nil {
		t.Fatal(err)
	}
	hubID := hub["id"].(string)
	if hub["platform"] != "Gmail" || hub["region"] != "GLOBAL" {
		t.Fatalf("unexpected hub payload: %+v", hub)
	}

	// 2. Create a downstream keep-alive account linked to the hub email
	subReq := map[string]any{
		"presetKey":         "telegram",
		"platform":          "Telegram",
		"label":             "国际通讯",
		"identifier":        "@irm_tester",
		"category":          "social",
		"ecosystem":         "overseas",
		"region":            "SG",
		"role":              "primary",
		"status":            "active",
		"authMethod":        "code",
		"recoveryAccountId": hubID,
		"phoneHint":         "+44 *9900",
		"twoFactor":         "totp",
		"recoveryCodes":     "missing",
		"keepaliveCycle":    "quarterly",
		"nextCheckinDate":   "2026-11-01",
	}
	subRes := call("POST", "/accounts", subReq)
	if subRes.Code != 201 {
		t.Fatalf("create downstream %d %s", subRes.Code, subRes.Body)
	}
	var downstream map[string]any
	if err := json.Unmarshal(subRes.Body.Bytes(), &downstream); err != nil {
		t.Fatal(err)
	}
	downID := downstream["id"].(string)

	// 3. Reject invalid inputs: self-reference, missing foreign key, ID leak, bad URL
	selfRef := map[string]any{
		"platform": "Gmail", "identifier": "main@example.invalid", "category": "email",
		"ecosystem": "overseas", "region": "GLOBAL", "recoveryAccountId": hubID,
	}
	if got := call("PUT", "/accounts/"+hubID, selfRef).Code; got != 400 {
		t.Fatalf("expected 400 on self reference, got %d", got)
	}
	badFK := map[string]any{
		"platform": "WeChat", "identifier": "wx_user", "category": "social",
		"ecosystem": "domestic", "region": "CN", "ssoAccountId": "non-existent-id",
	}
	if got := call("POST", "/accounts", badFK).Code; got != 400 {
		t.Fatalf("expected 400 on invalid ssoAccountId, got %d", got)
	}
	badKYC := map[string]any{
		"platform": "小红书", "identifier": "red_user", "category": "social",
		"ecosystem": "domestic", "region": "CN", "kycStatus": "verified", "kycNote": "31010119920508123X",
	}
	if got := call("POST", "/accounts", badKYC).Code; got != 400 {
		t.Fatalf("expected 400 on ID card pattern in kycNote, got %d", got)
	}
	if got := call("POST", "/accounts/"+hubID+"/checkin", map[string]string{"nextCheckinDate": ""}).Code; got != 400 {
		t.Fatalf("expected 400 on non-keepalive checkin, got %d", got)
	}

	// 4. Keep-alive check-in advances deadline and prevents duplicate concurrent submission
	checked := call("POST", "/accounts/"+downID+"/checkin", map[string]string{
		"nextCheckinDate": "2026-11-01",
		"checkedOn":       "2026-11-13",
	})
	if checked.Code != 200 || !strings.Contains(checked.Body.String(), `"nextCheckinDate":"2027-02-13"`) || !strings.Contains(checked.Body.String(), `"lastCheckedAt":"2026-11-13"`) {
		t.Fatalf("unexpected checkin result: %d %s", checked.Code, checked.Body)
	}
	if got := call("POST", "/accounts/"+downID+"/checkin", map[string]string{"nextCheckinDate": "2026-11-01", "checkedOn": "2026-11-13"}).Code; got != 409 {
		t.Fatalf("expected 409 on duplicate checkin, got %d", got)
	}

	// 5. Counts reflect active accounts; archiving decrements count; deleting upstream clears FK via ON DELETE SET NULL
	if body := call("GET", "/nav-counts", nil).Body.String(); !strings.Contains(body, `"accounts":2`) {
		t.Fatalf("unexpected nav-counts: %s", body)
	}
	for _, field := range []string{"id", "createdAt", "updatedAt"} {
		delete(hub, field)
	}
	hub["archived"] = true
	if got := call("PUT", "/accounts/"+hubID, hub).Code; got != 200 {
		t.Fatalf("archive hub %d", got)
	}
	if body := call("GET", "/nav-counts", nil).Body.String(); !strings.Contains(body, `"accounts":1`) {
		t.Fatalf("unexpected nav-counts after archive: %s", body)
	}

	// Reopen DB to verify persistence
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	handler = server.NewHandler(store, nil)

	if got := call("DELETE", "/accounts/"+hubID, nil).Code; got != 200 {
		t.Fatalf("delete hub %d", got)
	}
	list := call("GET", "/accounts", nil)
	if list.Code != 200 || !strings.Contains(list.Body.String(), downID) || !strings.Contains(list.Body.String(), `"recoveryAccountId":""`) {
		t.Fatalf("expected downstream account with cleared recoveryAccountId, got %s", list.Body)
	}
}
