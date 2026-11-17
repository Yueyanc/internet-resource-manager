package cloudsync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestKeyRingSealAndOpen(t *testing.T) {
	kr, err := LoadOrCreateKeyRing(t.TempDir())
	if err != nil {
		t.Fatalf("LoadOrCreateKeyRing: %v", err)
	}
	in := CloudflareCredentials{APIToken: "cf_secret_token_1234567890"}
	ct, nonce, err := kr.SealJSON("conn1:cloudflare", in)
	if err != nil {
		t.Fatalf("SealJSON: %v", err)
	}
	var out CloudflareCredentials
	if err := kr.OpenJSON("conn1:cloudflare", ct, nonce, &out); err != nil {
		t.Fatalf("OpenJSON: %v", err)
	}
	if out.APIToken != in.APIToken {
		t.Fatalf("got %q, want %q", out.APIToken, in.APIToken)
	}
	if err := kr.OpenJSON("conn2:cloudflare", ct, nonce, &out); err == nil {
		t.Fatal("expected AAD mismatch to fail decryption")
	}
}

func TestCloudflareTokenTemplatesReadOnly(t *testing.T) {
	tpl := CloudflareTokenTemplates()
	if !strings.HasPrefix(tpl.UserTokenURL, "https://dash.cloudflare.com/profile/api-tokens?") {
		t.Fatalf("unexpected UserTokenURL: %s", tpl.UserTokenURL)
	}
	if strings.Contains(tpl.UserTokenURL, "edit") || strings.Contains(tpl.AccountTokenURL, "edit") {
		t.Fatal("template URLs must strictly request read-only permissions")
	}
}

func TestHTTPCloudflareClientVerifyAndFetchSnapshot(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer cf_valid_readonly_token_1234" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/user/tokens/verify":
			_, _ = w.Write([]byte(`{"success":true,"result":{"id":"tok1","status":"active"}}`))
		case "/accounts":
			_, _ = w.Write([]byte(`{"success":true,"result":[{"id":"acc_1","name":"Yueyan Lab"}]}`))
		case "/zones":
			_, _ = w.Write([]byte(`{
				"success":true,
				"result":[{
					"id":"zone_1",
					"name":"example.cn",
					"status":"active",
					"paused":false,
					"name_servers":["ada.ns.cloudflare.com","bob.ns.cloudflare.com"],
					"account":{"id":"acc_1","name":"Yueyan Lab"},
					"plan":{"name":"Free Website"}
				}],
				"result_info":{"page":1,"per_page":50,"total_pages":1,"total_count":1}
			}`))
		case "/accounts/acc_1/registrar/domains":
			_, _ = w.Write([]byte(`{"success":true,"result":[]}`))
		case "/accounts/acc_1/cfd_tunnel":
			_, _ = w.Write([]byte(`{"success":true,"result":[{"id":"tun_1","name":"homelab","status":"healthy"}]}`))
		case "/accounts/acc_1/cfd_tunnel/tun_1/configurations":
			_, _ = w.Write([]byte(`{"success":true,"result":{"config":{"ingress":[{"hostname":"nas.example.cn","service":"http://127.0.0.1:5000"},{"service":"http_status:404"}]}}}`))
		case "/accounts/acc_1/pages/projects":
			_, _ = w.Write([]byte(`{"success":true,"result":[{"name":"blog","subdomain":"blog.pages.dev","domains":["blog.example.cn"]}]}`))
		case "/zones/zone_1/dns_records":
			_, _ = w.Write([]byte(`{"success":true,"result":[
				{"id":"r1","type":"A","name":"irm.example.cn","content":"203.0.113.10","proxied":true,"ttl":1},
				{"id":"r2","type":"CNAME","name":"nas.example.cn","content":"tun_1.cfargotunnel.com","proxied":true,"ttl":1}
			]}`))
		case "/zones/zone_1/workers/routes":
			_, _ = w.Write([]byte(`{"success":true,"result":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	client := &HTTPCloudflareClient{BaseURL: srv.URL, HTTPClient: srv.Client()}
	ver, err := client.Verify(context.Background(), "cf_valid_readonly_token_1234")
	if err != nil {
		t.Fatalf("Verify error: %v", err)
	}
	if ver.ZonesCount != 1 || len(ver.AccountNames) != 1 || ver.AccountNames[0] != "Yueyan Lab" {
		t.Fatalf("unexpected verify summary: %+v", ver)
	}

	snap, err := client.FetchSnapshot(context.Background(), "cf_valid_readonly_token_1234")
	if err != nil {
		t.Fatalf("FetchSnapshot error: %v", err)
	}
	if len(snap.Zones) != 1 || len(snap.Zones[0].Records) != 2 || len(snap.Tunnels) != 1 || snap.Tunnels[0].Hostname != "nas.example.cn" || len(snap.Pages) != 1 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
}
