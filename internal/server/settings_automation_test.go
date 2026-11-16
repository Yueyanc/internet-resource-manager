package server_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

type stubFXFetcher struct {
	rates  map[string]float64
	source string
}

func (s stubFXFetcher) FetchCNYReferenceRates(_ context.Context) (map[string]float64, string, error) {
	return s.rates, s.source, nil
}

func TestSessionsPasswordFXBackupAndAutomation(t *testing.T) {
	var notifyMu sync.Mutex
	var receivedTelegram, receivedBark, receivedWebhook int

	notifyMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		notifyMu.Lock()
		defer notifyMu.Unlock()
		switch {
		case strings.HasPrefix(r.URL.Path, "/bot"):
			receivedTelegram++
		case r.URL.Path == "/push":
			receivedBark++
		case r.URL.Path == "/webhook":
			receivedWebhook++
			if !strings.Contains(string(body), "资源管家") {
				t.Errorf("unexpected webhook payload: %s", string(body))
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(notifyMock.Close)

	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	fxStub := stubFXFetcher{
		rates: map[string]float64{
			"CNY": 1,
			"USD": 7.1852,
			"EUR": 7.7612,
			"GBP": 9.2104,
			"HKD": 0.9231,
			"JPY": 0.0476,
		},
		source: "mock-fx",
	}

	handler := server.NewHandler(
		store,
		nil,
		server.WithFXFetcher(fxStub),
		server.WithNotificationClient(notifyMock.Client(), notifyMock.URL),
		server.WithVersion("0.1.10"),
	)

	callWith := func(method, path, body string, cookie *http.Cookie, ua string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+path, strings.NewReader(body))
		r.RemoteAddr = "127.0.0.1:54321"
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if ua != "" {
			r.Header.Set("User-Agent", ua)
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// 1. Setup session #1 (macOS Chrome) and login session #2 (iPhone Safari).
	w1 := callWith("POST", "/auth/setup", `{"username":"admin","password":"initial-password-123"}`, nil, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0")
	if w1.Code != http.StatusCreated {
		t.Fatalf("setup failed: %d %s", w1.Code, w1.Body.String())
	}
	cookie1 := w1.Result().Cookies()[0]

	w2 := callWith("POST", "/auth/login", `{"username":"admin","password":"initial-password-123"}`, nil, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")
	if w2.Code != http.StatusOK {
		t.Fatalf("login #2 failed: %d %s", w2.Code, w2.Body.String())
	}
	cookie2 := w2.Result().Cookies()[0]

	// List active sessions from cookie1.
	wSessions := callWith("GET", "/auth/sessions", "", cookie1, "")
	if wSessions.Code != http.StatusOK {
		t.Fatalf("list sessions: %d %s", wSessions.Code, wSessions.Body.String())
	}
	var sessionsResp struct {
		Items []storage.SessionInfo `json:"items"`
	}
	if err := json.Unmarshal(wSessions.Body.Bytes(), &sessionsResp); err != nil {
		t.Fatal(err)
	}
	if len(sessionsResp.Items) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessionsResp.Items))
	}

	// 2. Change password & username from cookie1 (revoking other sessions by default).
	wBadPwd := callWith("PUT", "/auth/password", `{"username":"yueyan","currentPassword":"wrong-password","newPassword":"updated-password-456"}`, cookie1, "")
	if wBadPwd.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on wrong current password, got %d", wBadPwd.Code)
	}

	wGoodPwd := callWith("PUT", "/auth/password", `{"username":"yueyan","currentPassword":"initial-password-123","newPassword":"updated-password-456"}`, cookie1, "")
	if wGoodPwd.Code != http.StatusOK {
		t.Fatalf("password update failed: %d %s", wGoodPwd.Code, wGoodPwd.Body.String())
	}

	// cookie2 should now be revoked while cookie1 stays valid.
	if got := callWith("GET", "/auth/sessions", "", cookie2, "").Code; got != http.StatusUnauthorized {
		t.Fatalf("expected cookie2 revoked (401), got %d", got)
	}
	if got := callWith("GET", "/auth/sessions", "", cookie1, "").Code; got != http.StatusOK {
		t.Fatalf("expected cookie1 still valid (200), got %d", got)
	}

	// 3. Live FX rate fetch & persistence.
	wFX := callWith("POST", "/preferences/fetch-rates", `{"baseCurrency":"CNY"}`, cookie1, "")
	if wFX.Code != http.StatusOK {
		t.Fatalf("fetch-rates failed: %d %s", wFX.Code, wFX.Body.String())
	}
	var fxResp struct {
		BaseCurrency   string             `json:"baseCurrency"`
		Rates          map[string]float64 `json:"rates"`
		RatesUpdatedAt string             `json:"ratesUpdatedAt"`
		Source         string             `json:"source"`
	}
	if err := json.Unmarshal(wFX.Body.Bytes(), &fxResp); err != nil {
		t.Fatal(err)
	}
	if fxResp.Rates["USD"] != 7.1852 || fxResp.RatesUpdatedAt == "" || fxResp.Source != "mock-fx" {
		t.Fatalf("unexpected fx response: %+v", fxResp)
	}

	// 4. Create an overdue auto-renewing subscription AND an overdue cancel-intended subscription.
	pastDate := time.Now().AddDate(0, -2, 0).Format("2006-01-02")
	soonDate := time.Now().AddDate(0, 0, 5).Format("2006-01-02")

	wSubAuto := callWith("POST", "/subscriptions", `{
		"presetKey":"chatgpt","name":"ChatGPT Plus","amountMinor":2000,"currency":"USD",
		"cycle":"monthly","intervalDays":0,"dueDate":"`+pastDate+`","category":"ai",
		"renewalMode":"auto","intention":"normal","renewalAmountMinor":0,
		"accountId":"","billingAccountId":"","account":"","paymentMethod":"","managementUrl":"","notes":"","archived":false
	}`, cookie1, "")
	if wSubAuto.Code != http.StatusCreated {
		t.Fatalf("create auto sub: %d %s", wSubAuto.Code, wSubAuto.Body.String())
	}
	var subAuto struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(wSubAuto.Body.Bytes(), &subAuto)

	wSubCancel := callWith("POST", "/subscriptions", `{
		"presetKey":"netflix","name":"Netflix 待退订","amountMinor":1599,"currency":"USD",
		"cycle":"monthly","intervalDays":0,"dueDate":"`+soonDate+`","category":"life",
		"renewalMode":"auto","intention":"cancel","renewalAmountMinor":0,
		"accountId":"","billingAccountId":"","account":"","paymentMethod":"","managementUrl":"","notes":"","archived":false
	}`, cookie1, "")
	if wSubCancel.Code != http.StatusCreated {
		t.Fatalf("create cancel sub: %d %s", wSubCancel.Code, wSubCancel.Body.String())
	}

	// 5. Save automation config + test notifications + run inspection.
	autoPayload := `{
		"expiryLeadDays":14,
		"dailyDigestHour":9,
		"notifyOnServerOffline":true,
		"trafficAlertThresholdPct":85,
		"autoAdvanceSubscriptions":true,
		"autoSyncEnabled":true,
		"autoSyncIntervalHours":6,
		"telegramEnabled":true,
		"telegramBotToken":"123456:ABCDEF-secret-token",
		"telegramChatId":"-100987654",
		"barkEnabled":true,
		"barkServerUrl":"` + notifyMock.URL + `",
		"barkDeviceKey":"bark-device-secret-key",
		"webhookEnabled":true,
		"webhookUrl":"` + notifyMock.URL + `/webhook"
	}`
	wSaveAuto := callWith("PUT", "/system/automation", autoPayload, cookie1, "")
	if wSaveAuto.Code != http.StatusOK {
		t.Fatalf("save automation: %d %s", wSaveAuto.Code, wSaveAuto.Body.String())
	}
	if strings.Contains(wSaveAuto.Body.String(), "ABCDEF-secret-token") {
		t.Fatalf("raw secret leaked in automation GET/PUT response: %s", wSaveAuto.Body.String())
	}

	// Update config with empty secret fields -> existing encrypted secrets must be preserved.
	wResaveAuto := callWith("PUT", "/system/automation", `{
		"expiryLeadDays":21,
		"dailyDigestHour":10,
		"notifyOnServerOffline":true,
		"trafficAlertThresholdPct":80,
		"autoAdvanceSubscriptions":true,
		"autoSyncEnabled":true,
		"autoSyncIntervalHours":12,
		"telegramEnabled":true,
		"telegramChatId":"-100987654",
		"barkEnabled":true,
		"barkServerUrl":"`+notifyMock.URL+`",
		"webhookEnabled":true
	}`, cookie1, "")
	if wResaveAuto.Code != http.StatusOK {
		t.Fatalf("resave automation preserving secrets failed: %d %s", wResaveAuto.Code, wResaveAuto.Body.String())
	}

	wTestNotify := callWith("POST", "/system/automation/test-notify", "", cookie1, "")
	if wTestNotify.Code != http.StatusOK {
		t.Fatalf("test-notify failed: %d %s", wTestNotify.Code, wTestNotify.Body.String())
	}

	wRun := callWith("POST", "/system/automation/run", "", cookie1, "")
	if wRun.Code != http.StatusOK {
		t.Fatalf("automation run failed: %d %s", wRun.Code, wRun.Body.String())
	}
	var runSummary server.InspectionSummary
	if err := json.Unmarshal(wRun.Body.Bytes(), &runSummary); err != nil {
		t.Fatal(err)
	}
	if runSummary.SubscriptionsAdvanced != 1 {
		t.Fatalf("expected 1 auto-advanced subscription, got %d", runSummary.SubscriptionsAdvanced)
	}
	if runSummary.ExpiringCount < 1 || len(runSummary.NotificationsSent) != 3 {
		t.Fatalf("unexpected inspection summary: %+v", runSummary)
	}

	notifyMu.Lock()
	if receivedTelegram < 2 || receivedBark < 2 || receivedWebhook < 2 {
		t.Fatalf("expected >=2 dispatches per channel (test + inspection), got tg=%d bark=%d webhook=%d", receivedTelegram, receivedBark, receivedWebhook)
	}
	notifyMu.Unlock()

	// Verify ChatGPT Plus dueDate was advanced >= today.
	updatedSub, err := store.GetSubscription(t.Context(), subAuto.ID)
	if err != nil {
		t.Fatal(err)
	}
	today := time.Now().Format("2006-01-02")
	if updatedSub.DueDate < today {
		t.Fatalf("expected dueDate >= %s, got %s", today, updatedSub.DueDate)
	}

	// 6. Verify storage info, SQLite hot backup, and JSON asset export.
	wStorage := callWith("GET", "/system/storage", "", cookie1, "")
	if wStorage.Code != http.StatusOK {
		t.Fatalf("system storage failed: %d %s", wStorage.Code, wStorage.Body.String())
	}

	wDB := callWith("GET", "/system/backup/sqlite", "", cookie1, "")
	if wDB.Code != http.StatusOK {
		t.Fatalf("sqlite backup failed: %d", wDB.Code)
	}
	snapPath := filepath.Join(t.TempDir(), "downloaded.db")
	if err := os.WriteFile(snapPath, wDB.Body.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	if err := storage.VerifySQLiteFile(t.Context(), snapPath); err != nil {
		t.Fatalf("downloaded SQLite snapshot failed quick_check: %v", err)
	}

	wJSON := callWith("GET", "/system/backup/json", "", cookie1, "")
	if wJSON.Code != http.StatusOK {
		t.Fatalf("json export failed: %d %s", wJSON.Code, wJSON.Body.String())
	}
	var exported struct {
		SchemaVersion int             `json:"schemaVersion"`
		Version       string          `json:"version"`
		Subscriptions []any           `json:"subscriptions"`
		Preferences   json.RawMessage `json:"preferences"`
	}
	if err := json.Unmarshal(wJSON.Body.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	if exported.SchemaVersion != 1 || exported.Version != "v0.1.10" || len(exported.Subscriptions) != 2 {
		t.Fatalf("unexpected json export: %+v", exported)
	}
}
