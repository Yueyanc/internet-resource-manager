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

func TestSubscriptionLifecycleAndPreferences(t *testing.T) {
	path := filepath.Join(t.TempDir(), "subscriptions.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+path, strings.NewReader(string(data)))
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
	input := map[string]any{"presetKey": "bilibili", "name": " Test ", "amountMinor": 2000, "currency": "USD", "cycle": "monthly", "dueDate": "2026-01-31", "category": "ai", "renewalMode": "auto", "intention": "cancel"}
	created := call("POST", "/subscriptions", input)
	if created.Code != 201 {
		t.Fatalf("create %d %s", created.Code, created.Body)
	}
	var value map[string]any
	if err := json.Unmarshal(created.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	id := value["id"].(string)
	if value["name"] != "Test" || value["presetKey"] != "bilibili" {
		t.Fatal(value)
	}
	for _, field := range []string{"id", "createdAt", "updatedAt"} {
		delete(value, field)
	}
	for key, bad := range map[string]any{"presetKey": "BAD SLUG!", "currency": "INVALID", "cycle": "weekly", "intervalDays": -1, "dueDate": "2026-02-30", "amountMinor": -1, "managementUrl": "javascript:alert(1)"} {
		copy := map[string]any{}
		for k, v := range value {
			copy[k] = v
		}
		copy[key] = bad
		if key == "intervalDays" {
			copy["cycle"] = "custom"
		}
		if got := call("POST", "/subscriptions", copy).Code; got != 400 {
			t.Errorf("invalid %s status %d", key, got)
		}
	}
	renewed := call("POST", "/subscriptions/"+id+"/renew", map[string]string{"dueDate": "2026-01-31"})
	if renewed.Code != 200 || !strings.Contains(renewed.Body.String(), "2026-02-28") {
		t.Fatal(renewed.Body)
	}
	if got := call("POST", "/subscriptions/"+id+"/renew", map[string]string{"dueDate": "2026-01-31"}).Code; got != 409 {
		t.Fatalf("duplicate renewal %d", got)
	}
	value["dueDate"] = "2026-02-28"
	value["archived"] = true
	if got := call("PUT", "/subscriptions/"+id, value).Code; got != 200 {
		t.Fatalf("archive %d", got)
	}
	if body := call("GET", "/nav-counts", nil).Body.String(); !strings.Contains(body, `"subscriptions":0`) {
		t.Fatal(body)
	}
	if got := call("POST", "/subscriptions/"+id+"/renew", map[string]string{"dueDate": "2026-02-28"}).Code; got != 409 {
		t.Fatalf("archived renewal %d", got)
	}
	prefs := map[string]any{"baseCurrency": "USD", "rates": map[string]float64{"CNY": 1, "USD": 7, "HKD": 0.9, "EUR": 8, "GBP": 9, "JPY": 0.05}}
	if got := call("PUT", "/preferences", prefs).Code; got != 200 {
		t.Fatalf("save preferences %d", got)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	handler = server.NewHandler(store, nil)
	if body := call("GET", "/subscriptions", nil).Body.String(); !strings.Contains(body, id) || !strings.Contains(body, `"archived":true`) {
		t.Fatal(body)
	}
	if body := call("GET", "/preferences", nil).Body.String(); !strings.Contains(body, `"baseCurrency":"USD"`) {
		t.Fatal(body)
	}
	if got := call("DELETE", "/subscriptions/"+id, nil).Code; got != 200 {
		t.Fatalf("delete %d", got)
	}
	if got := call("PUT", "/subscriptions/missing", value).Code; got != 404 {
		t.Fatalf("missing update %d", got)
	}
	if got := call("PUT", "/preferences", map[string]any{"baseCurrency": "CNY", "rates": map[string]float64{"CNY": 1}}).Code; got != 400 {
		t.Fatalf("incomplete rates %d", got)
	}
}

func TestSubscriptionUpstreamAccountsAndInlineCreate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub-accounts.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+path, strings.NewReader(string(data)))
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

	// 1. Create an existing billing store account (Apple US)
	appleRes := call("POST", "/accounts", map[string]any{
		"presetKey":  "apple",
		"platform":   "Apple 账户",
		"label":      "美区主力",
		"identifier": "apple.us@example.invalid",
		"category":   "ecosystem",
		"ecosystem":  "overseas",
		"region":     "US",
		"role":       "hub",
	})
	if appleRes.Code != 201 {
		t.Fatalf("create apple account %d %s", appleRes.Code, appleRes.Body)
	}
	var apple map[string]any
	_ = json.Unmarshal(appleRes.Body.Bytes(), &apple)
	appleID := apple["id"].(string)

	// 2. Reject nonexistent accountId or conflict with createAccount
	badLink := call("POST", "/subscriptions", map[string]any{
		"name":        "Bad Link",
		"amountMinor": 2000,
		"currency":    "USD",
		"cycle":       "monthly",
		"dueDate":     "2026-12-01",
		"category":    "ai",
		"renewalMode": "auto",
		"intention":   "normal",
		"accountId":   "missing-account-id",
	})
	if badLink.Code != 400 {
		t.Fatalf("expected 400 for missing accountId, got %d", badLink.Code)
	}

	// 3. Create subscription with inline createAccount + existing billingAccountId
	subRes := call("POST", "/subscriptions", map[string]any{
		"presetKey":        "chatgpt",
		"name":             "ChatGPT Plus",
		"amountMinor":      2000,
		"currency":         "USD",
		"cycle":            "monthly",
		"dueDate":          "2026-12-01",
		"category":         "ai",
		"renewalMode":      "auto",
		"intention":        "normal",
		"billingAccountId": appleID,
		"paymentMethod":    "Apple App Store 订阅",
		"createAccount": map[string]any{
			"presetKey":    "openai",
			"platform":     "ChatGPT",
			"label":        "主力",
			"identifier":   "openai@example.invalid",
			"category":     "ai_productivity",
			"ecosystem":    "overseas",
			"region":       "US",
			"ssoAccountId": appleID,
		},
	})
	if subRes.Code != 201 {
		t.Fatalf("create sub with inline account %d %s", subRes.Code, subRes.Body)
	}
	var sub map[string]any
	_ = json.Unmarshal(subRes.Body.Bytes(), &sub)
	subID := sub["id"].(string)
	openaiID := sub["accountId"].(string)
	if openaiID == "" || openaiID == appleID {
		t.Fatalf("unexpected accountId %q", openaiID)
	}
	if sub["billingAccountId"] != appleID {
		t.Fatalf("expected billingAccountId %q, got %v", appleID, sub["billingAccountId"])
	}

	// Verify inline account persisted in /accounts
	accList := call("GET", "/accounts", nil)
	if !strings.Contains(accList.Body.String(), "openai@example.invalid") {
		t.Fatalf("expected inline created account in list: %s", accList.Body.String())
	}

	// 4. Deleting billingAccount resets billingAccountId to empty via ON DELETE SET NULL
	if del := call("DELETE", "/accounts/"+appleID, nil); del.Code != 200 {
		t.Fatalf("delete apple account %d", del.Code)
	}
	subList := call("GET", "/subscriptions", nil)
	var listed struct {
		Items []map[string]any `json:"items"`
	}
	_ = json.Unmarshal(subList.Body.Bytes(), &listed)
	if len(listed.Items) != 1 || listed.Items[0]["id"] != subID {
		t.Fatalf("unexpected subscriptions after account delete: %s", subList.Body.String())
	}
	if listed.Items[0]["accountId"] != openaiID || listed.Items[0]["billingAccountId"] != "" {
		t.Fatalf("expected ON DELETE SET NULL for billingAccountId, got %v", listed.Items[0])
	}
}
