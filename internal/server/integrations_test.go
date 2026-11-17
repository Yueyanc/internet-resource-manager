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
			"example.cn": {
				ApexDomain:  "example.cn",
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
					Hostname: "nas.example.cn",
					Service:  "http://127.0.0.1:8080",
				},
			},
			Pages: []cloudsync.SyncedPagesProject{
				{
					Name:      "blog-pages",
					Subdomain: "blog-pages.pages.dev",
					Domains:   []string{"blog.example.cn"},
				},
			},
			Zones: []cloudsync.ZoneSnapshot{
				{
					ZoneID:      "zone-cn-1",
					Name:        "example.cn",
					Status:      "active",
					PlanName:    "Free Website",
					AccountName: "Yueyan's Account",
					NameServers: []string{"ada.ns.cloudflare.com", "bob.ns.cloudflare.com"},
					Records: []cloudsync.SyncedDNSRecord{
						{
							ID:      "rec-a",
							Type:    "A",
							Name:    "irm.example.cn",
							Content: "203.0.113.42",
							Proxied: true,
							TTL:     1,
						},
						{
							ID:      "rec-cname",
							Type:    "CNAME",
							Name:    "app.example.cn",
							Content: "alpha.node.example.net",
							Proxied: false,
							TTL:     300,
						},
					},
					WorkerRoutes: []string{"api.example.cn/*"},
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

	// 1. Seed a server and an IP that match the DNS records in example.cn.
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
	previewRec := doReq(http.MethodPost, "/api/v1/domains/lookup-preview", `{"name":"sub.example.cn"}`)
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

	// 3. Test unified provider catalog includes Cloudflare read-only token template link.
	tplRec := doReq(http.MethodGet, "/api/v1/integrations/providers", "")
	if tplRec.Code != http.StatusOK {
		t.Fatalf("providers = %d: %s", tplRec.Code, tplRec.Body)
	}
	if !strings.Contains(tplRec.Body.String(), "dash.cloudflare.com/profile/api-tokens") {
		t.Fatalf("missing cloudflare template url in catalog: %s", tplRec.Body.String())
	}

	// 4. Reject invalid Cloudflare token via unified connect endpoint.
	badConn := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"cloudflare","credentials":{"apiToken":"wrong_token_value_123456"}}`)
	if badConn.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid token, got %d: %s", badConn.Code, badConn.Body)
	}

	// 5. Connect valid Cloudflare token with immediate sync.
	goodConn := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"cloudflare","credentials":{"apiToken":"`+rawToken+`"},"label":"主账号 CF"}`)
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

	cn := listPayload.Items[byName["example.cn"]]
	if cn.Registrar != "阿里云万网" || cn.ExpireDate != "2027-08-19" || cn.DNSProvider != "Cloudflare DNS" {
		t.Fatalf("example.cn WHOIS + CF enrichment mismatch: %+v", cn)
	}
	if !slices.Contains(cn.ServerIDs, createdSrv.ID) || !slices.Contains(cn.IPIDs, createdIP.ID) {
		t.Fatalf("expected auto-linked server %s and ip %s, got servers=%v ips=%v", createdSrv.ID, createdIP.ID, cn.ServerIDs, cn.IPIDs)
	}
	if cn.EdgeMeta == nil || len(cn.EdgeMeta.Tunnels) != 1 || len(cn.EdgeMeta.PagesProjects) != 1 {
		t.Fatalf("expected tunnel and pages metadata on example.cn, got %+v", cn.EdgeMeta)
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

type staticAdapter struct {
	key  string
	snap cloudsync.UnifiedSnapshot
}

func (a staticAdapter) ProviderKey() string { return a.key }

func (a staticAdapter) ValidateCredentials(creds cloudsync.Credentials) (cloudsync.Credentials, string, error) {
	if len(creds) == 0 {
		return nil, "", cloudsync.ErrInvalidCredentials
	}
	return creds, "demo****hint", nil
}

func (a staticAdapter) Fetch(_ context.Context, _ cloudsync.Credentials) (cloudsync.UnifiedSnapshot, error) {
	return a.snap, nil
}

func TestMultiProviderUnifiedConnectAndCrossProviderMerge(t *testing.T) {
	store, err := storage.Open(t.Context(), filepath.Join(t.TempDir(), "multi.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	cfClient := fakeCloudflareClient{
		validToken: "cf_valid_token_1234567890",
		verify: cloudsync.VerifySummary{
			AccountNames: []string{"Main Edge"},
			Scopes:       []string{"zones:read", "dns:read"},
			ZonesCount:   1,
		},
		snapshot: cloudsync.Snapshot{
			AccountNames: []string{"Main Edge"},
			Scopes:       []string{"zones:read", "dns:read"},
			Zones: []cloudsync.ZoneSnapshot{
				{
					ZoneID:      "cf-zone-1",
					Name:        "stack.dev",
					Status:      "active",
					PlanName:    "Free",
					AccountName: "Main Edge",
					NameServers: []string{"ada.ns.cloudflare.com"},
					Records: []cloudsync.SyncedDNSRecord{
						{ID: "r1", Name: "stack.dev", Type: "A", Content: "95.216.10.20", Proxied: true},
					},
				},
			},
		},
	}

	reg := cloudsync.NewDefaultRegistry(cfClient)
	reg.Register(staticAdapter{
		key: "hetzner",
		snap: cloudsync.UnifiedSnapshot{
			Provider:     "hetzner",
			AccountNames: []string{"Hetzner Prod"},
			Scopes:       []string{"servers:read"},
			Servers: []cloudsync.SyncedServer{
				{
					ExternalID:   "hz:101",
					PresetKey:    "hetzner",
					Name:         "edge-node-01",
					Hostname:     "edge-node-01",
					ProviderName: "Hetzner",
					Kind:         "cloud_vps",
					Status:       "active",
					Region:       "DE",
					OS:           "Ubuntu 24.04",
					Arch:         "x86_64",
					CPUCores:     4,
					MemoryMB:     8192,
					DiskGB:       80,
					TrafficGB:    20000,
					IPv4:         "95.216.10.20",
					SSHPort:      22,
					Meta: cloudsync.ServerProviderMeta{
						Provider:          "hetzner",
						ExternalID:        "hz:101",
						TrafficUsedBytes:  500 * 1024 * 1024 * 1024,
						TrafficTotalBytes: 20000 * 1024 * 1024 * 1024,
					},
				},
			},
			IPs: []cloudsync.SyncedIP{
				{
					ExternalID:     "hz-ip4:101",
					PresetKey:      "hetzner",
					Address:        "95.216.10.20",
					NetworkScope:   "overseas_exit",
					Category:       "cloud_vps",
					ProviderName:   "Hetzner",
					Label:          "edge-node-01",
					Region:         "DE",
					HostExternalID: "hz:101",
				},
			},
		},
	})
	reg.Register(staticAdapter{
		key: "tailscale",
		snap: cloudsync.UnifiedSnapshot{
			Provider:     "tailscale",
			AccountNames: []string{"tail99.ts.net"},
			Scopes:       []string{"devices:core:read"},
			Servers: []cloudsync.SyncedServer{
				{
					ExternalID:   "ts:node-1",
					PresetKey:    "custom",
					Name:         "edge-node-01",
					Hostname:     "edge-node-01",
					ProviderName: "Tailscale",
					Kind:         "cloud_vps",
					Status:       "active",
					PrivateIP:    "100.77.0.5",
					Meta: cloudsync.ServerProviderMeta{
						Provider:      "tailscale",
						LastSeenAt:    "2026-11-15T14:00:00Z",
						ClientVersion: "1.76.1",
					},
				},
			},
			IPs: []cloudsync.SyncedIP{
				{
					ExternalID:     "ts-ip4:node-1",
					PresetKey:      "tailscale",
					Address:        "100.77.0.5",
					NetworkScope:   "overlay_private",
					Category:       "overlay_mesh",
					ProviderName:   "Tailscale",
					Label:          "edge-node-01 (Tailnet)",
					HostExternalID: "ts:node-1",
				},
			},
		},
	})
	reg.Register(staticAdapter{
		key: "porkbun",
		snap: cloudsync.UnifiedSnapshot{
			Provider:     "porkbun",
			AccountNames: []string{"Porkbun Portfolio"},
			Scopes:       []string{"domain/listAll"},
			Registrar: map[string]cloudsync.RegistrarDomainInfo{
				"stack.dev": {
					Name:      "stack.dev",
					ExpiresAt: "2029-01-15",
					AutoRenew: true,
					Privacy:   true,
				},
			},
			Zones: []cloudsync.ZoneSnapshot{
				{
					ZoneID:           "porkbun:stack.dev",
					Name:             "stack.dev",
					Status:           "active",
					DefaultPresetKey: "porkbun",
					RegistrarOnly:    true,
				},
			},
		},
	})

	h := server.NewHandler(
		store,
		nil,
		server.WithCloudflareClient(cfClient),
		server.WithCloudSyncRegistry(reg),
		server.WithDomainLookuper(fakeDomainLookuper{}),
	)

	var sessionCookie *http.Cookie
	doReq := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "http://localhost"+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if sessionCookie != nil {
			req.AddCookie(sessionCookie)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		for _, c := range rec.Result().Cookies() {
			if c.Name == "irm_session" {
				sessionCookie = c
			}
		}
		return rec
	}

	if res := doReq(http.MethodPost, "/api/v1/auth/setup", `{"username":"admin","password":"strong-password-123"}`); res.Code != http.StatusCreated {
		t.Fatalf("setup = %d: %s", res.Code, res.Body)
	}

	// 1. Check /integrations/providers returns all 10 providers.
	provRes := doReq(http.MethodGet, "/api/v1/integrations/providers", "")
	if provRes.Code != http.StatusOK {
		t.Fatalf("providers = %d: %s", provRes.Code, provRes.Body)
	}
	var provBody struct {
		Items []cloudsync.ProviderMetaSpec `json:"items"`
	}
	if err := json.Unmarshal(provRes.Body.Bytes(), &provBody); err != nil || len(provBody.Items) < 10 {
		t.Fatalf("expected >=10 provider specs, got %d (%v)", len(provBody.Items), err)
	}

	// 2. Connect Hetzner -> imports 1 server + 1 public IP.
	if res := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"hetzner","credentials":{"apiToken":"hz_secret_1234567890"}}`); res.Code != http.StatusCreated {
		t.Fatalf("connect hetzner = %d: %s", res.Code, res.Body)
	}
	// 3. Connect Tailscale -> merges PrivateIP + LastSeenAt onto edge-node-01 WITHOUT losing Hetzner TrafficTotalBytes!
	if res := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"tailscale","credentials":{"apiToken":"tskey-api-123456"}}`); res.Code != http.StatusCreated {
		t.Fatalf("connect tailscale = %d: %s", res.Code, res.Body)
	}
	// 4. Connect Cloudflare -> imports stack.dev with DNS record auto-linked to edge-node-01 and 95.216.10.20.
	if res := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"cloudflare","credentials":{"apiToken":"cf_valid_token_1234567890"}}`); res.Code != http.StatusCreated {
		t.Fatalf("connect cloudflare = %d: %s", res.Code, res.Body)
	}
	// 5. Connect Porkbun -> enriches stack.dev Registrar + ExpireDate WITHOUT wiping Cloudflare DNS records!
	if res := doReq(http.MethodPost, "/api/v1/integrations/connect", `{"provider":"porkbun","credentials":{"apiKey":"pk1_demo","secretApiKey":"sk1_demo"}}`); res.Code != http.StatusCreated {
		t.Fatalf("connect porkbun = %d: %s", res.Code, res.Body)
	}

	srvRes := doReq(http.MethodGet, "/api/v1/servers", "")
	var srvPayload struct {
		Items []struct {
			Name         string                        `json:"name"`
			Provider     string                        `json:"provider"`
			IPv4         string                        `json:"ipv4"`
			PrivateIP    string                        `json:"privateIp"`
			IPIDs        []string                      `json:"ipIds"`
			ProviderMeta *cloudsync.ServerProviderMeta `json:"providerMeta"`
		} `json:"items"`
	}
	_ = json.Unmarshal(srvRes.Body.Bytes(), &srvPayload)
	if len(srvPayload.Items) != 1 {
		t.Fatalf("expected Hetzner + Tailscale to merge into 1 server, got %d: %+v", len(srvPayload.Items), srvPayload.Items)
	}
	mergedSrv := srvPayload.Items[0]
	if mergedSrv.IPv4 != "95.216.10.20" || mergedSrv.PrivateIP != "100.77.0.5" || len(mergedSrv.IPIDs) != 2 {
		t.Fatalf("expected merged IPv4 + Tailnet PrivateIP + 2 linked IPs, got %+v", mergedSrv)
	}
	if mergedSrv.ProviderMeta == nil || mergedSrv.ProviderMeta.TrafficTotalBytes == 0 || mergedSrv.ProviderMeta.LastSeenAt == "" {
		t.Fatalf("expected merged Hetzner traffic + Tailscale lastSeenAt in ProviderMeta, got %+v", mergedSrv.ProviderMeta)
	}

	domRes := doReq(http.MethodGet, "/api/v1/domains", "")
	var domPayload struct {
		Items []struct {
			Name       string                      `json:"name"`
			Registrar  string                      `json:"registrar"`
			ExpireDate string                      `json:"expireDate"`
			DNSRecords []cloudsync.SyncedDNSRecord `json:"dnsRecords"`
			ServerIDs  []string                    `json:"serverIds"`
		} `json:"items"`
	}
	_ = json.Unmarshal(domRes.Body.Bytes(), &domPayload)
	if len(domPayload.Items) != 1 {
		t.Fatalf("expected 1 merged domain stack.dev, got %+v", domPayload.Items)
	}
	mergedDom := domPayload.Items[0]
	if mergedDom.Registrar != "Porkbun" || mergedDom.ExpireDate != "2029-01-15" || len(mergedDom.DNSRecords) != 1 || len(mergedDom.ServerIDs) != 1 {
		t.Fatalf("expected Porkbun registrar/expiry + preserved Cloudflare DNS records + linked Hetzner server: %+v", mergedDom)
	}
}
