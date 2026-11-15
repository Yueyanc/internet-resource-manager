package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

type fakeDomainLookuper struct {
	results map[string]domainname.LookupResult
}

func (f fakeDomainLookuper) Lookup(_ context.Context, fqdn string) (domainname.LookupResult, error) {
	apex, _ := domainname.ExtractApex(fqdn)
	if res, ok := f.results[apex]; ok {
		res.Domain = strings.ToLower(strings.TrimSpace(fqdn))
		return res, nil
	}
	return domainname.LookupResult{}, domainname.ErrDomainLookupFailed
}

type fakeCloudflareClient struct {
	validToken string
	verify     cloudsync.VerifySummary
	snapshot   cloudsync.Snapshot
}

func (f fakeCloudflareClient) Verify(_ context.Context, apiToken string) (cloudsync.VerifySummary, error) {
	if apiToken != f.validToken {
		return cloudsync.VerifySummary{}, cloudsync.ErrInvalidToken
	}
	return f.verify, nil
}

func (f fakeCloudflareClient) FetchSnapshot(_ context.Context, apiToken string) (cloudsync.Snapshot, error) {
	if apiToken != f.validToken {
		return cloudsync.Snapshot{}, cloudsync.ErrInvalidToken
	}
	return f.snapshot, nil
}

func TestCloudflareSyncAndDomainLookupEndToEnd(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	const rawToken = "cf_readonly_token_secret_1234567890"

	lookuper := fakeDomainLookuper{
		results: map[string]domainname.LookupResult{
			"yueyanc.cn": {
				ApexDomain:  "yueyanc.cn",
				Registrar:   "阿里云万网",
				DNSProvider: "Cloudflare",
				PresetKey:   "aliyun",
				ExpireDate:  "2027-08-19",
				NameServers: []string{"ada.ns.cloudflare.com", "bob.ns.cloudflare.com"},
				Source:      "whois",
				CheckedAt:   "2026-11-15T12:00:00Z",
			},
		},
	}

	cfClient := fakeCloudflareClient{
		validToken: rawToken,
		verify: cloudsync.VerifySummary{
			AccountNames: []string{"Yueyan's Account"},
			Scopes:       []string{"zones:read", "dns:read", "tunnels:read", "pages:read"},
			ZonesCount:   2,
		},
		snapshot: cloudsync.Snapshot{
			AccountNames: []string{"Yueyan's Account"},
			Scopes:       []string{"zones:read", "dns:read", "tunnels:read", "pages:read"},
			Registrar: map[string]cloudsync.RegistrarDomainInfo{
				"cfreg.dev": {
					Name:      "cfreg.dev",
					ExpiresAt: "2028-04-01",
					AutoRenew: true,
					Privacy:   true,
				},
			},
			Tunnels: []cloudsync.SyncedTunnelRoute{
				{
					ID:       "tun-1",
					Name:     "homelab-edge",
					Status:   "healthy",
					Hostname: "nas.yueyanc.cn",
					Service:  "http://127.0.0.1:8080",
				},
			},
			Pages: []cloudsync.SyncedPagesProject{
				{
					Name:      "blog-pages",
					Subdomain: "blog-pages.pages.dev",
					Domains:   []string{"blog.yueyanc.cn"},
				},
			},
			Zones: []cloudsync.ZoneSnapshot{
				{
					ZoneID:      "zone-cn-1",
					Name:        "yueyanc.cn",
					Status:      "active",
					PlanName:    "Free Website",
					AccountName: "Yueyan's Account",
					NameServers: []string{"ada.ns.cloudflare.com", "bob.ns.cloudflare.com"},
					Records: []cloudsync.SyncedDNSRecord{
						{
							ID:      "rec-a",
							Type:    "A",
							Name:    "irm.yueyanc.cn",
							Content: "203.0.113.42",
							Proxied: true,
							TTL:     1,
						},
						{
							ID:      "rec-cname",
							Type:    "CNAME",
							Name:    "app.yueyanc.cn",
							Content: "alpha.node.example.net",
							Proxied: false,
							TTL:     300,
						},
					},
					WorkerRoutes: []string{"api.yueyanc.cn/*"},
				},
				{
					ZoneID:      "zone-dev-2",
					Name:        "cfreg.dev",
					Status:      "active",
					PlanName:    "Pro Website",
					AccountName: "Yueyan's Account",
					NameServers: []string{"ada.ns.cloudflare.com", "bob.ns.cloudflare.com"},
				},
			},
		},
	}

	handler := server.NewHandler(
		store,
		nil,
		server.WithDomainLookuper(lookuper),
		server.WithCloudflareClient(cfClient),
	)

	var sessionCookie *http.Cookie
	doReq := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "http://127.0.0.1"+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if sessionCookie != nil {
			req.AddCookie(sessionCookie)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	setup := doReq(http.MethodPost, "/api/v1/auth/setup", `{"username":"admin","password":"correct-horse-battery"}`)
	if setup.Code != http.StatusCreated {
		t.Fatalf("setup = %d: %s", setup.Code, setup.Body)
	}
	sessionCookie = setup.Result().Cookies()[0]

	// 1. Seed a server and an IP that match the DNS records in yueyanc.cn.
	srvRec := doReq(http.MethodPost, "/api/v1/servers", `{
		"name":"Alpha Node","hostname":"alpha.node.example.net"
	}`)
	if srvRec.Code != http.StatusCreated {
		t.Fatalf("create server = %d: %s", srvRec.Code, srvRec.Body)
	}
	var createdSrv struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(srvRec.Body.Bytes(), &createdSrv)

	ipRec := doReq(http.MethodPost, "/api/v1/ips", `{
		"address":"203.0.113.42"
	}`)
	if ipRec.Code != http.StatusCreated {
		t.Fatalf("create ip = %d: %s", ipRec.Code, ipRec.Body)
	}
	var createdIP struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(ipRec.Body.Bytes(), &createdIP)

	// 2. Test RDAP/WHOIS preview endpoint before saving any domain.
	previewRec := doReq(http.MethodPost, "/api/v1/domains/lookup-preview", `{"name":"sub.yueyanc.cn"}`)
	if previewRec.Code != http.StatusOK {
		t.Fatalf("lookup-preview = %d: %s", previewRec.Code, previewRec.Body)
	}
	var preview domainname.LookupResult
	if err := json.Unmarshal(previewRec.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if preview.Registrar != "阿里云万网" || preview.ExpireDate != "2027-08-19" || preview.PresetKey != "aliyun" {
		t.Fatalf("unexpected lookup preview: %+v", preview)
	}

	// 3. Test Cloudflare token template endpoint.
	tplRec := doReq(http.MethodGet, "/api/v1/integrations/cloudflare/template", "")
	if tplRec.Code != http.StatusOK {
		t.Fatalf("template = %d: %s", tplRec.Code, tplRec.Body)
	}
	if !strings.Contains(tplRec.Body.String(), "dash.cloudflare.com/profile/api-tokens") {
		t.Fatalf("missing template url: %s", tplRec.Body.String())
	}

	// 4. Reject invalid Cloudflare token.
	badConn := doReq(http.MethodPost, "/api/v1/integrations/cloudflare", `{"apiToken":"wrong_token_value_123456"}`)
	if badConn.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid token, got %d: %s", badConn.Code, badConn.Body)
	}

	// 5. Connect valid Cloudflare token with immediate sync.
	goodConn := doReq(http.MethodPost, "/api/v1/integrations/cloudflare", `{"apiToken":"`+rawToken+`","label":"主账号 CF"}`)
	if goodConn.Code != http.StatusCreated {
		t.Fatalf("connect cloudflare = %d: %s", goodConn.Code, goodConn.Body)
	}
	if strings.Contains(goodConn.Body.String(), rawToken) {
		t.Fatalf("raw API token leaked in HTTP response: %s", goodConn.Body.String())
	}

	var connBody struct {
		Connection struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"connection"`
		SyncStats storage.SyncStats `json:"syncStats"`
	}
	if err := json.Unmarshal(goodConn.Body.Bytes(), &connBody); err != nil {
		t.Fatal(err)
	}
	if connBody.Connection.Status != "ok" || connBody.SyncStats.DomainsImported != 2 || connBody.SyncStats.ServerLinksAdded != 1 || connBody.SyncStats.IPLinksAdded != 1 {
		t.Fatalf("unexpected sync summary: %+v", connBody)
	}

	// 6. Verify domains list contains enriched DNS records, topology links, Registrar expiry, and WHOIS fallback expiry.
	domList := doReq(http.MethodGet, "/api/v1/domains", "")
	if domList.Code != http.StatusOK {
		t.Fatalf("list domains = %d: %s", domList.Code, domList.Body)
	}
	var listPayload struct {
		Items []struct {
			ID                   string                      `json:"id"`
			Name                 string                      `json:"name"`
			Registrar            string                      `json:"registrar"`
			DNSProvider          string                      `json:"dnsProvider"`
			ExpireDate           string                      `json:"expireDate"`
			AutoRenew            bool                        `json:"autoRenew"`
			WhoisPrivacy         bool                        `json:"whoisPrivacy"`
			ServerIDs            []string                    `json:"serverIds"`
			IPIDs                []string                    `json:"ipIds"`
			ProviderConnectionID string                      `json:"providerConnectionId"`
			DNSRecords           []cloudsync.SyncedDNSRecord `json:"dnsRecords"`
			EdgeMeta             *cloudsync.DomainEdgeMeta   `json:"edgeMeta"`
		} `json:"items"`
	}
	if err := json.Unmarshal(domList.Body.Bytes(), &listPayload); err != nil {
		t.Fatal(err)
	}
	if len(listPayload.Items) != 2 {
		t.Fatalf("expected 2 synced domains, got %d", len(listPayload.Items))
	}

	byName := make(map[string]int, len(listPayload.Items))
	for idx, item := range listPayload.Items {
		byName[item.Name] = idx
	}

	cn := listPayload.Items[byName["yueyanc.cn"]]
	if cn.Registrar != "阿里云万网" || cn.ExpireDate != "2027-08-19" || cn.DNSProvider != "Cloudflare DNS" {
		t.Fatalf("yueyanc.cn WHOIS + CF enrichment mismatch: %+v", cn)
	}
	if !slices.Contains(cn.ServerIDs, createdSrv.ID) || !slices.Contains(cn.IPIDs, createdIP.ID) {
		t.Fatalf("expected auto-linked server %s and ip %s, got servers=%v ips=%v", createdSrv.ID, createdIP.ID, cn.ServerIDs, cn.IPIDs)
	}
	if cn.EdgeMeta == nil || len(cn.EdgeMeta.Tunnels) != 1 || len(cn.EdgeMeta.PagesProjects) != 1 {
		t.Fatalf("expected tunnel and pages metadata on yueyanc.cn, got %+v", cn.EdgeMeta)
	}

	dev := listPayload.Items[byName["cfreg.dev"]]
	if dev.Registrar != "Cloudflare" || dev.ExpireDate != "2028-04-01" || !dev.AutoRenew || !dev.WhoisPrivacy {
		t.Fatalf("cfreg.dev Cloudflare Registrar enrichment mismatch: %+v", dev)
	}

	// 7. Deleting the integration removes the stored token while keeping imported domains intact.
	delRec := doReq(http.MethodDelete, "/api/v1/integrations/"+connBody.Connection.ID, "")
	if delRec.Code != http.StatusOK {
		t.Fatalf("delete integration = %d: %s", delRec.Code, delRec.Body)
	}
	afterDel := doReq(http.MethodGet, "/api/v1/domains", "")
	var afterPayload struct {
		Items []struct {
			Name                 string `json:"name"`
			ProviderConnectionID string `json:"providerConnectionId"`
		} `json:"items"`
	}
	_ = json.Unmarshal(afterDel.Body.Bytes(), &afterPayload)
	if len(afterPayload.Items) != 2 || afterPayload.Items[0].ProviderConnectionID != "" {
		t.Fatalf("domains should remain intact with cleared providerConnectionId: %+v", afterPayload.Items)
	}
}
