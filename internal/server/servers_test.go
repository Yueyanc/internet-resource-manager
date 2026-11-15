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

func TestServersLifecycleInlineSubscriptionAndRelations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "servers.db")
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

	if unauth := call("GET", "/servers", nil); unauth.Code != 401 {
		t.Fatalf("expected 401 before login, got %d", unauth.Code)
	}

	setup := call("POST", "/auth/setup", map[string]string{"username": "admin", "password": "test-only-password"})
	if setup.Code != 201 {
		t.Fatal(setup.Body)
	}
	cookie = setup.Result().Cookies()[0]

	// Create domain, account, and IP node to link to a server
	domRes := call("POST", "/domains", map[string]string{"name": "edge.example.com", "notes": "Reverse proxy"})
	if domRes.Code != 201 {
		t.Fatalf("create domain: %d %s", domRes.Code, domRes.Body)
	}
	var dom map[string]any
	_ = json.Unmarshal(domRes.Body.Bytes(), &dom)
	domID := dom["id"].(string)

	accRes := call("POST", "/accounts", map[string]any{
		"presetKey":  "oracle",
		"platform":   "DMIT",
		"identifier": "ops@example.invalid",
		"category":   "dev_cloud",
		"ecosystem":  "overseas",
		"region":     "US",
	})
	if accRes.Code != 201 {
		t.Fatalf("create account: %d %s", accRes.Code, accRes.Body)
	}
	var acc map[string]any
	_ = json.Unmarshal(accRes.Body.Bytes(), &acc)
	accID := acc["id"].(string)

	ipRes := call("POST", "/ips", map[string]any{
		"address":      "203.0.113.18",
		"networkScope": "overseas_exit",
		"category":     "cloud_vps",
		"provider":     "DMIT",
		"region":       "US",
		"unlocks":      map[string]any{},
		"tags":         []string{"CN2 GIA"},
		"manualLocks":  []string{},
		"domainIds":    []string{},
		"accountIds":   []string{},
	})
	if ipRes.Code != 201 {
		t.Fatalf("create ip: %d %s", ipRes.Code, ipRes.Body)
	}
	var ipNode map[string]any
	_ = json.Unmarshal(ipRes.Body.Bytes(), &ipNode)
	ipID := ipNode["id"].(string)

	// 1. Create server with inline subscription creation and cross-resource links
	createReq := map[string]any{
		"presetKey":       "dmit",
		"name":            " LAX-Pro-Wee ",
		"hostname":        "lax-pro-01.internal",
		"provider":        "DMIT",
		"kind":            "vps",
		"status":          "active",
		"region":          "us",
		"datacenter":      "Los Angeles Pro",
		"os":              "Debian 12",
		"arch":            "amd64",
		"cpuCores":        1,
		"memoryMb":        1024,
		"diskGb":          20,
		"diskType":        "ssd",
		"bandwidthMbps":   500,
		"trafficGb":       450,
		"trafficRule":     "both",
		"trafficResetDay": 15,
		"ipv4":            "203.0.113.18",
		"ipv6":            "[2001:0db8::0001]",
		"privateIp":       "100.64.0.18",
		"portNote":        "CN2 GIA",
		"sshPort":         28192,
		"sshUser":         "debian",
		"consoleUrl":      "https://www.dmit.io/clientarea.php",
		"accountId":       accID,
		"domainIds":       []string{domID},
		"ipIds":           []string{ipID},
		"tags":            []string{"主力反代", "传家宝"},
		"notes":           "美西主力入口节点",
		"createSubscription": map[string]any{
			"presetKey":          "dmit",
			"name":               "DMIT LAX.Pro.Wee",
			"amountMinor":        3690,
			"currency":           "USD",
			"cycle":              "yearly",
			"intervalDays":       0,
			"dueDate":            "2027-06-15",
			"category":           "cloud",
			"renewalMode":        "manual",
			"intention":          "keep",
			"renewalAmountMinor": 0,
			"account":            "ops@example.invalid",
			"paymentMethod":      "PayPal",
			"managementUrl":      "https://www.dmit.io/clientarea.php",
			"notes":              "",
			"archived":           false,
		},
	}

	srvRes := call("POST", "/servers", createReq)
	if srvRes.Code != 201 {
		t.Fatalf("create server: %d %s", srvRes.Code, srvRes.Body)
	}
	var srv map[string]any
	if err := json.Unmarshal(srvRes.Body.Bytes(), &srv); err != nil {
		t.Fatal(err)
	}
	srvID := srv["id"].(string)
	subID := srv["subscriptionId"].(string)
	if srv["name"] != "LAX-Pro-Wee" || srv["region"] != "US" || srv["ipv6"] != "2001:db8::1" || subID == "" {
		t.Fatalf("unexpected server payload: %+v", srv)
	}

	// Check nav-counts includes servers: 1 and subscriptions: 1
	countsRes := call("GET", "/nav-counts", nil)
	if countsRes.Code != 200 {
		t.Fatalf("counts: %d %s", countsRes.Code, countsRes.Body)
	}
	var counts map[string]int
	_ = json.Unmarshal(countsRes.Body.Bytes(), &counts)
	if counts["servers"] != 1 || counts["subscriptions"] != 1 {
		t.Fatalf("unexpected counts: %+v", counts)
	}

	// Check IP node now carries serverId
	ipsListRes := call("GET", "/ips", nil)
	var ipsPayload struct {
		Items []map[string]any `json:"items"`
	}
	_ = json.Unmarshal(ipsListRes.Body.Bytes(), &ipsPayload)
	if len(ipsPayload.Items) != 1 || ipsPayload.Items[0]["serverId"] != srvID {
		t.Fatalf("expected IP serverId=%s, got %+v", srvID, ipsPayload.Items)
	}

	// 2. Reject unsafe private key in notes and non-existent relation IDs
	badKey := call("POST", "/servers", map[string]any{
		"name":  "Unsafe",
		"notes": "-----BEGIN RSA PRIVATE KEY-----\nabc",
	})
	if badKey.Code != 400 {
		t.Fatalf("expected 400 for private key in notes, got %d", badKey.Code)
	}

	badLink := call("POST", "/servers", map[string]any{
		"name":           "Broken-Link",
		"subscriptionId": "missing-sub",
	})
	if badLink.Code != 400 {
		t.Fatalf("expected 400 for missing subscription link, got %d", badLink.Code)
	}

	// 3. Archive server and verify count drops to 0
	archiveReq := map[string]any{
		"presetKey":      "dmit",
		"name":           "LAX-Pro-Wee",
		"provider":       "DMIT",
		"kind":           "vps",
		"status":         "retiring",
		"region":         "US",
		"arch":           "amd64",
		"sshPort":        28192,
		"subscriptionId": subID,
		"accountId":      accID,
		"domainIds":      []string{domID},
		"ipIds":          []string{ipID},
		"tags":           []string{"主力反代"},
		"archived":       true,
	}
	archRes := call("PUT", "/servers/"+srvID, archiveReq)
	if archRes.Code != 200 {
		t.Fatalf("archive server: %d %s", archRes.Code, archRes.Body)
	}
	countsAfterArchive := call("GET", "/nav-counts", nil)
	_ = json.Unmarshal(countsAfterArchive.Body.Bytes(), &counts)
	if counts["servers"] != 0 {
		t.Fatalf("expected archived server excluded from counts, got %+v", counts)
	}

	// 4. Delete server clears IP serverId and second delete returns 404
	delRes := call("DELETE", "/servers/"+srvID, nil)
	if delRes.Code != 200 {
		t.Fatalf("delete server: %d %s", delRes.Code, delRes.Body)
	}
	if delAgain := call("DELETE", "/servers/"+srvID, nil); delAgain.Code != 404 {
		t.Fatalf("expected 404 on second delete, got %d", delAgain.Code)
	}
	ipsAfterDel := call("GET", "/ips", nil)
	_ = json.Unmarshal(ipsAfterDel.Body.Bytes(), &ipsPayload)
	if ipsPayload.Items[0]["serverId"] != "" {
		t.Fatalf("expected IP serverId cleared after server deletion, got %+v", ipsPayload.Items[0])
	}
}
