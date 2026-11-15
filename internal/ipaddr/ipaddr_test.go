package ipaddr_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
)

func TestParseAddressAndSSRFClassification(t *testing.T) {
	cases := []struct {
		raw           string
		wantCanonical string
		wantVersion   int64
		wantPrefixLen int64
		wantIsPrefix  bool
		wantPublic    bool
		wantProbing   bool
	}{
		{" 154.12.34.56 ", "154.12.34.56", 4, 32, false, true, true},
		{"154.12.34.56/32", "154.12.34.56", 4, 32, false, true, true},
		{"::ffff:154.12.34.56", "154.12.34.56", 4, 32, false, true, true},
		{"154.12.34.99/24", "154.12.34.0/24", 4, 24, true, true, false},
		{"[2a01:04f8:c012:0000::0001]", "2a01:4f8:c012::1", 6, 128, false, true, true},
		{"2a01:04f8:c012:abcd::1/48", "2a01:4f8:c012::/48", 6, 48, true, true, false},
		// Non-public / SSRF vectors must never allow active probing:
		{"127.0.0.1", "127.0.0.1", 4, 32, false, false, false},
		{"::1", "::1", 6, 128, false, false, false},
		{"::ffff:127.0.0.1", "127.0.0.1", 4, 32, false, false, false},
		{"169.254.169.254", "169.254.169.254", 4, 32, false, false, false},
		{"::ffff:169.254.169.254", "169.254.169.254", 4, 32, false, false, false},
		{"10.10.0.5", "10.10.0.5", 4, 32, false, false, false},
		{"172.16.8.9", "172.16.8.9", 4, 32, false, false, false},
		{"192.168.50.1", "192.168.50.1", 4, 32, false, false, false},
		{"100.64.0.42", "100.64.0.42", 4, 32, false, false, false},
		{"203.0.113.15", "203.0.113.15", 4, 32, false, false, false},
		{"2002:7f00:0001::1", "2002:7f00:1::1", 6, 128, false, false, false},
		{"64:ff9b::127.0.0.1", "64:ff9b::7f00:1", 6, 128, false, false, false},
		{"fd7a:115c:a1e0::1", "fd7a:115c:a1e0::1", 6, 128, false, false, false},
		{"fe80::1", "fe80::1", 6, 128, false, false, false},
	}

	prober := ipaddr.NewDefaultProber()
	for _, tc := range cases {
		parsed, err := ipaddr.ParseAddress(tc.raw)
		if err != nil {
			t.Fatalf("ParseAddress(%q) unexpected error: %v", tc.raw, err)
		}
		if parsed.Canonical != tc.wantCanonical ||
			parsed.Version != tc.wantVersion ||
			parsed.PrefixLen != tc.wantPrefixLen ||
			parsed.IsPrefix != tc.wantIsPrefix ||
			parsed.PublicRoutable != tc.wantPublic ||
			parsed.ProbingAllowed != tc.wantProbing {
			t.Fatalf("ParseAddress(%q) = %+v", tc.raw, parsed)
		}
		if !tc.wantProbing {
			if _, err := prober.Probe(t.Context(), parsed, "tcp", 443); err == nil {
				t.Fatalf("expected Prober to refuse %q", tc.raw)
			}
		}
	}

	for _, bad := range []string{"", "0.0.0.0", "::", "0.0.0.0/0", "::/0", "fe80::1%en0", "not-an-ip", "1.2.3.4/33"} {
		if _, err := ipaddr.ParseAddress(bad); err == nil {
			t.Fatalf("expected ParseAddress(%q) to fail", bad)
		}
	}
}

func TestValidateRejectsCredentialMaterialAndNormalizesUnlocks(t *testing.T) {
	bad := ipaddr.Input{
		Address:  "154.12.34.56",
		Category: "residential_isp",
		Notes:    "节点链接 vless://secret-uuid@154.12.34.56:443",
	}
	if _, err := bad.Validate(); err == nil || !strings.Contains(err.Error(), "安全红线") {
		t.Fatalf("expected credential material rejection, got %v", err)
	}

	valid := ipaddr.Input{
		Address:      " 154.12.34.56/32 ",
		Category:     "residential_isp",
		NetworkScope: "overseas_exit",
		Provider:     " AT&T ",
		Label:        " 美西家宽 ",
		Region:       "us",
		ASN:          7018,
		ASNType:      "residential",
		OriginType:   "native",
		RiskLevel:    "clean",
		Unlocks: map[string]ipaddr.UnlockEntry{
			"claude":  {Status: "full", Region: "us"},
			"netflix": {Status: "partial", Region: "us"},
			"tiktok":  {Status: "unknown", Region: "us"},
		},
		Tags:           []string{" PayPal专号 ", "双ISP", "PayPal专号"},
		ManualLocks:    []string{"region", "asn"},
		ReviewCycle:    "monthly",
		NextReviewDate: "2026-01-31",
		ProbeMode:      "tcp",
		ProbePort:      443,
		ConsoleURL:     "https://console.example.com/nodes",
	}
	parsed, err := valid.Validate()
	if err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	if !parsed.ProbingAllowed || valid.Address != "154.12.34.56" || valid.Region != "US" {
		t.Fatalf("unexpected normalized input: %+v", valid)
	}
	if len(valid.Unlocks) != 2 || valid.Unlocks["claude"].Region != "US" {
		t.Fatalf("unexpected unlocks normalization: %+v", valid.Unlocks)
	}
	if len(valid.Tags) != 2 {
		t.Fatalf("expected deduplicated tags, got %+v", valid.Tags)
	}

	next, reviewed, err := ipaddr.AdvanceReview("2026-01-31", "2026-01-31", "monthly", 0)
	if err != nil || next != "2026-02-28" || reviewed != "2026-01-31" {
		t.Fatalf("unexpected month-end clamped review date: %s %s %v", next, reviewed, err)
	}
}

type stubResolver struct {
	ptrs []string
	txts map[string][]string
}

func (s stubResolver) LookupAddr(_ context.Context, _ string) ([]string, error) {
	return s.ptrs, nil
}

func (s stubResolver) LookupTXT(_ context.Context, name string) ([]string, error) {
	return s.txts[name], nil
}

func (s stubResolver) LookupNetIP(_ context.Context, _, _ string) ([]netip.Addr, error) {
	return nil, nil
}

func TestDefaultLookuperParsesRDAPAndPTR(t *testing.T) {
	rdapServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/rdap+json")
		_, _ = w.Write([]byte(`{
			"name": "ATT-INTERNET4",
			"country": "us",
			"arin_originas0_originautnums": [7018],
			"entities": [
				{
					"roles": ["registrant"],
					"vcardArray": ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "AT&T Enterprises, LLC"]]]
				}
			]
		}`))
	}))
	defer rdapServer.Close()

	lookuper := &ipaddr.DefaultLookuper{
		RDAPBaseURL: rdapServer.URL,
		HTTPClient:  rdapServer.Client(),
		Resolver: stubResolver{
			ptrs: []string{"99-12-34-56.lightspeed.sntcca.sbcglobal.net."},
		},
	}

	parsed, err := ipaddr.ParseAddress("99.12.34.56")
	if err != nil {
		t.Fatal(err)
	}
	res, err := lookuper.Lookup(t.Context(), parsed)
	if err != nil {
		t.Fatalf("Lookup failed: %v", err)
	}
	if res.Region != "US" || res.ASN != 7018 || res.ASNOrg != "AT&T Enterprises, LLC" || res.PTRRecord != "99-12-34-56.lightspeed.sntcca.sbcglobal.net" {
		t.Fatalf("unexpected lookup result: %+v", res)
	}

	privateParsed, _ := ipaddr.ParseAddress("100.64.0.9")
	if _, err := lookuper.Lookup(t.Context(), privateParsed); err != ipaddr.ErrNonPublicAddress {
		t.Fatalf("expected ErrNonPublicAddress for Tailscale IP, got %v", err)
	}
}
