package domainname

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractApex(t *testing.T) {
	cases := []struct {
		fqdn string
		apex string
		tld  string
	}{
		{"irm.example.cn", "example.cn", "cn"},
		{"api.app.example.com.cn", "example.com.cn", "com.cn"},
		{"craftstudio.io", "craftstudio.io", "io"},
		{"portal.service.co.uk", "service.co.uk", "co.uk"},
	}
	for _, tc := range cases {
		apex, tld := ExtractApex(tc.fqdn)
		if apex != tc.apex || tld != tc.tld {
			t.Fatalf("ExtractApex(%q) = (%q, %q), want (%q, %q)", tc.fqdn, apex, tld, tc.apex, tc.tld)
		}
	}
}

func TestLookupRDAPAndCNNICWHOISFallback(t *testing.T) {
	rdapSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/domain/example.com" {
			w.Header().Set("Content-Type", "application/rdap+json")
			_, _ = w.Write([]byte(`{
				"ldhName": "EXAMPLE.COM",
				"status": ["client transfer prohibited"],
				"events": [
					{"eventAction": "registration", "eventDate": "2020-03-15T00:00:00Z"},
					{"eventAction": "expiration", "eventDate": "2028-03-15T23:59:59Z"}
				],
				"nameservers": [
					{"ldhName": "ADA.NS.CLOUDFLARE.COM"},
					{"ldhName": "BOB.NS.CLOUDFLARE.COM"}
				],
				"entities": [
					{
						"roles": ["registrar"],
						"vcardArray": ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Porkbun LLC"]]]
					}
				]
			}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer rdapSrv.Close()

	lookuper := &DefaultLookuper{
		RDAPBaseURL: rdapSrv.URL + "/domain",
		HTTPClient:  rdapSrv.Client(),
		WHOISQuery: func(_ context.Context, serverHost, query string) (string, error) {
			if serverHost == "whois.cnnic.cn" && query == "example.cn" {
				return `Domain Name: example.cn
Sponsoring Registrar: 阿里云计算有限公司（万网）
Name Server: ada.ns.cloudflare.com
Name Server: bob.ns.cloudflare.com
Registration Time: 2022-05-10 12:00:00
Expiration Time: 2027-05-10 12:00:00
Domain Status: clientTransferProhibited`, nil
			}
			return "", ErrDomainLookupFailed
		},
	}

	// 1. Subdomain on .com hits RDAP on apex, detects Porkbun registrar + Cloudflare DNS!
	comRes, err := lookuper.Lookup(context.Background(), "api.example.com")
	if err != nil {
		t.Fatalf("Lookup(api.example.com) unexpected error: %v", err)
	}
	if comRes.ApexDomain != "example.com" || comRes.ExpireDate != "2028-03-15" || comRes.Registrar != "Porkbun" || comRes.DNSProvider != "Cloudflare DNS" || comRes.PresetKey != "porkbun" || !comRes.TransferLocked || comRes.Source != "rdap" {
		t.Fatalf("unexpected RDAP result: %+v", comRes)
	}

	// 2. .cn domain gets 404 from RDAP and seamlessly falls back to CNNIC WHOIS!
	cnRes, err := lookuper.Lookup(context.Background(), "irm.example.cn")
	if err != nil {
		t.Fatalf("Lookup(irm.example.cn) unexpected error: %v", err)
	}
	if cnRes.ApexDomain != "example.cn" || cnRes.ExpireDate != "2027-05-10" || cnRes.Registrar != "阿里云万网" || cnRes.DNSProvider != "Cloudflare DNS" || cnRes.PresetKey != "aliyun_wanwang" || cnRes.Source != "whois" {
		t.Fatalf("unexpected CNNIC WHOIS fallback result: %+v", cnRes)
	}
}
