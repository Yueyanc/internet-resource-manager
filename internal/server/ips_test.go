package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

type fakeLookuper struct {
	result ipaddr.LookupResult
	err    error
}

func (f *fakeLookuper) Lookup(_ context.Context, parsed ipaddr.ParsedAddress) (ipaddr.LookupResult, error) {
	if f.err != nil {
		return ipaddr.LookupResult{}, f.err
	}
	res := f.result
	res.Address = parsed.Canonical
	return res, nil
}

type fakeProber struct {
	result ipaddr.ProbeResult
	err    error
}

func (f *fakeProber) Probe(_ context.Context, _ ipaddr.ParsedAddress, _ string, _ int) (ipaddr.ProbeResult, error) {
	if f.err != nil {
		return ipaddr.ProbeResult{}, f.err
	}
	return f.result, nil
}

func TestIPsLifecycleLinksLookupProbeAndReview(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ips.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()

	lookuper := &fakeLookuper{
		result: ipaddr.LookupResult{
			Region:    "US",
			City:      "Los Angeles",
			ASN:       7018,
			ASNOrg:    "AT&T Services, Inc.",
			PTRRecord: "lax-res.sbcglobal.net",
			Source:    "rdap+ptr",
			CheckedAt: "2026-11-13T12:00:00Z",
		},
	}
	prober := &fakeProber{
		result: ipaddr.ProbeResult{
			Status:    "reachable",
			LatencyMs: 138,
			CheckedAt: "2026-11-13T12:05:00Z",
		},
	}

	handler := server.NewHandler(store, nil, server.WithIPServices(lookuper, prober))
	var cookie *http.Cookie
	call := func(method, target string, body any) *httptest.ResponseRecorder {
		t.Helper()
		var raw string
		if body != nil {
			data, _ := json.Marshal(body)
			raw = string(data)
		}
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+target, strings.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	setup := call("POST", "/auth/setup", map[string]string{"username": "admin", "password": "test-only-password"})
	if setup.Code != http.StatusCreated {
		t.Fatal(setup.Body)
	}
	cookie = setup.Result().Cookies()[0]

	// Create linked domain, subscription, and account
	domRes := call("POST", "/domains", map[string]string{"name": "edge.example.com", "notes": "exit"})
	if domRes.Code != http.StatusCreated {
		t.Fatalf("create domain: %d %s", domRes.Code, domRes.Body)
	}
	var dom map[string]any
	_ = json.Unmarshal(domRes.Body.Bytes(), &dom)
	domID := dom["id"].(string)

	subRes := call("POST", "/subscriptions", map[string]any{
		"name": "LAX Residential ISP", "amountMinor": 2500, "currency": "USD",
		"cycle": "monthly", "dueDate": "2026-11-28", "category": "network",
		"renewalMode": "auto", "intention": "keep",
	})
	if subRes.Code != http.StatusCreated {
		t.Fatalf("create sub: %d %s", subRes.Code, subRes.Body)
	}
	var sub map[string]any
	_ = json.Unmarshal(subRes.Body.Bytes(), &sub)
	subID := sub["id"].(string)

	accRes := call("POST", "/accounts", map[string]any{
		"platform": "PayPal", "label": "美区主号", "identifier": "us.pay@example.invalid",
		"category": "finance_commerce", "ecosystem": "overseas", "region": "US",
	})
	if accRes.Code != http.StatusCreated {
		t.Fatalf("create account: %d %s", accRes.Code, accRes.Body)
	}
	var acc map[string]any
	_ = json.Unmarshal(accRes.Body.Bytes(), &acc)
	accID := acc["id"].(string)

	// Preview lookup before saving
	previewRes := call("POST", "/ips/lookup-preview", map[string]string{"address": " 99.12.34.56 "})
	if previewRes.Code != http.StatusOK {
		t.Fatalf("lookup preview: %d %s", previewRes.Code, previewRes.Body)
	}

	// Non-public preview lookup must be rejected
	nonPublicPreview := call("POST", "/ips/lookup-preview", map[string]string{"address": "169.254.169.254"})
	if nonPublicPreview.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on metadata IP lookup, got %d", nonPublicPreview.Code)
	}

	// Create primary residential IP with manual lock on city
	createReq := map[string]any{
		"presetKey":      "att_isp",
		"address":        " 99.12.34.56/32 ",
		"networkScope":   "overseas_exit",
		"category":       "residential_isp",
		"provider":       "AT&T",
		"label":          "美西双ISP专号出口",
		"region":         "US",
		"city":           "San Jose",
		"asn":            7018,
		"asnOrg":         "AT&T",
		"asnType":        "residential",
		"originType":     "native",
		"riskLevel":      "clean",
		"purityNote":     "Scamalytics 0 · Ping0 原生家宽",
		"unlocks":        map[string]any{"claude": map[string]string{"status": "full", "region": "US"}, "netflix": map[string]string{"status": "full", "region": "US"}},
		"tags":           []string{"PayPal专号", "双ISP"},
		"manualLocks":    []string{"city"},
		"role":           "dedicated",
		"status":         "active",
		"reviewCycle":    "quarterly",
		"nextReviewDate": "2026-11-15",
		"probeMode":      "tcp",
		"probePort":      443,
		"subscriptionId": subID,
		"domainIds":      []string{domID},
		"accountIds":     []string{accID},
		"hostLabel":      "lax-att-01",
		"consoleUrl":     "https://portal.example.com/ips",
	}
	ipRes := call("POST", "/ips", createReq)
	if ipRes.Code != http.StatusCreated {
		t.Fatalf("create ip: %d %s", ipRes.Code, ipRes.Body)
	}
	var created map[string]any
	_ = json.Unmarshal(ipRes.Body.Bytes(), &created)
	ipID := created["id"].(string)
	if created["address"] != "99.12.34.56" || created["probeStatus"] != "unchecked" {
		t.Fatalf("unexpected created IP: %+v", created)
	}

	// Duplicate IP must return 409 already_exists
	dup := call("POST", "/ips", createReq)
	if dup.Code != http.StatusConflict {
		t.Fatalf("expected 409 duplicate IP, got %d %s", dup.Code, dup.Body)
	}

	// Lookup refresh respects manualLocks ("city" remains "San Jose", while asnOrg updates)
	refreshed := call("POST", "/ips/"+ipID+"/lookup", map[string]any{})
	if refreshed.Code != http.StatusOK {
		t.Fatalf("refresh lookup: %d %s", refreshed.Code, refreshed.Body)
	}
	var refreshedBody map[string]any
	_ = json.Unmarshal(refreshed.Body.Bytes(), &refreshedBody)
	if refreshedBody["city"] != "San Jose" || refreshedBody["asnOrg"] != "AT&T Services, Inc." || refreshedBody["ptrRecord"] != "lax-res.sbcglobal.net" {
		t.Fatalf("manual lock not respected or lookup not applied: %+v", refreshedBody)
	}

	// Failed lookup must return 502 and NEVER overwrite existing values
	lookuper.err = errors.New("upstream timeout")
	failedLookup := call("POST", "/ips/"+ipID+"/lookup", map[string]any{})
	if failedLookup.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on lookup failure, got %d", failedLookup.Code)
	}
	lookuper.err = nil

	// Probe reachability
	probed := call("POST", "/ips/"+ipID+"/probe", map[string]any{})
	if probed.Code != http.StatusOK {
		t.Fatalf("probe ip: %d %s", probed.Code, probed.Body)
	}
	var probedBody map[string]any
	_ = json.Unmarshal(probed.Body.Bytes(), &probedBody)
	if probedBody["probeStatus"] != "reachable" || int64(probedBody["probeLatencyMs"].(float64)) != 138 {
		t.Fatalf("unexpected probe response: %+v", probedBody)
	}

	// Create Tailscale overlay IP -> probeStatus must be skipped_non_public and probing blocked
	tsRes := call("POST", "/ips", map[string]any{
		"presetKey": "tailscale", "address": "100.64.0.42", "category": "overlay_subnet",
		"networkScope": "overlay_private", "region": "LAN", "label": "Home NAS",
	})
	if tsRes.Code != http.StatusCreated {
		t.Fatalf("create tailscale ip: %d %s", tsRes.Code, tsRes.Body)
	}
	var tsBody map[string]any
	_ = json.Unmarshal(tsRes.Body.Bytes(), &tsBody)
	tsID := tsBody["id"].(string)
	if tsBody["probeStatus"] != "skipped_non_public" {
		t.Fatalf("expected skipped_non_public, got %+v", tsBody)
	}
	if tsProbe := call("POST", "/ips/"+tsID+"/probe", map[string]any{}); tsProbe.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 probing Tailscale IP, got %d", tsProbe.Code)
	}

	// Review check-in advances date and rejects duplicate replay
	revRes := call("POST", "/ips/"+ipID+"/review", map[string]string{
		"nextReviewDate": "2026-11-15",
		"reviewedOn":     "2026-11-13",
	})
	if revRes.Code != http.StatusOK {
		t.Fatalf("review ip: %d %s", revRes.Code, revRes.Body)
	}
	var revBody map[string]any
	_ = json.Unmarshal(revRes.Body.Bytes(), &revBody)
	if revBody["nextReviewDate"] != "2027-02-13" {
		t.Fatalf("unexpected nextReviewDate: %v", revBody["nextReviewDate"])
	}
	if replay := call("POST", "/ips/"+ipID+"/review", map[string]string{"nextReviewDate": "2026-11-15", "reviewedOn": "2026-11-13"}); replay.Code != http.StatusConflict {
		t.Fatalf("expected 409 on replay review, got %d", replay.Code)
	}

	// Check nav-counts includes ips = 2, then archive one -> ips = 1
	countsRes := call("GET", "/nav-counts", nil)
	var counts map[string]int64
	_ = json.Unmarshal(countsRes.Body.Bytes(), &counts)
	if counts["ips"] != 2 {
		t.Fatalf("expected ips=2 in nav-counts, got %+v", counts)
	}

	createReq["archived"] = true
	createReq["nextReviewDate"] = "2027-02-13"
	archRes := call("PUT", "/ips/"+ipID, createReq)
	if archRes.Code != http.StatusOK {
		t.Fatalf("archive ip: %d %s", archRes.Code, archRes.Body)
	}
	countsRes = call("GET", "/nav-counts", nil)
	_ = json.Unmarshal(countsRes.Body.Bytes(), &counts)
	if counts["ips"] != 1 {
		t.Fatalf("expected ips=1 after archive, got %+v", counts)
	}

	delRes := call("DELETE", "/ips/"+ipID, nil)
	if delRes.Code != http.StatusOK {
		t.Fatalf("delete ip: %d %s", delRes.Code, delRes.Body)
	}
}
