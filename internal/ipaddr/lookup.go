package ipaddr

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LookupResult struct {
	Address   string `json:"address"`
	Region    string `json:"region"`
	City      string `json:"city"`
	ASN       int64  `json:"asn"`
	ASNOrg    string `json:"asnOrg"`
	PTRRecord string `json:"ptrRecord"`
	Source    string `json:"source"`
	CheckedAt string `json:"checkedAt"`
}

type Lookuper interface {
	Lookup(ctx context.Context, parsed ParsedAddress) (LookupResult, error)
}

type DNSResolver interface {
	LookupAddr(ctx context.Context, addr string) ([]string, error)
	LookupTXT(ctx context.Context, name string) ([]string, error)
	LookupNetIP(ctx context.Context, network, host string) ([]netip.Addr, error)
}

type DefaultLookuper struct {
	RDAPBaseURL string
	Resolver    DNSResolver
	HTTPClient  *http.Client
	Timeout     time.Duration
}

func NewDefaultLookuper() *DefaultLookuper {
	resolver := net.DefaultResolver
	timeout := 4500 * time.Millisecond
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, portStr, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			port, err := strconv.Atoi(portStr)
			if err != nil || (port != 443 && port != 80) {
				return nil, errors.New("disallowed rdap port")
			}
			ips, err := resolver.LookupNetIP(ctx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("resolve rdap host: %w", err)
			}
			for _, candidate := range ips {
				unmapped := candidate.Unmap()
				if !IsPublicRoutable(unmapped) {
					return nil, errors.New("rdap host resolved to non-public address")
				}
			}
			target := netip.AddrPortFrom(ips[0].Unmap(), uint16(port))
			return dialer.DialContext(ctx, network, target.String())
		},
	}
	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 4 {
				return errors.New("too many rdap redirects")
			}
			if req.URL.Scheme != "https" || req.URL.User != nil {
				return errors.New("disallowed rdap redirect target")
			}
			return nil
		},
	}
	return &DefaultLookuper{
		RDAPBaseURL: "https://rdap.org/ip",
		Resolver:    resolver,
		HTTPClient:  client,
		Timeout:     timeout,
	}
}

func (l *DefaultLookuper) Lookup(ctx context.Context, parsed ParsedAddress) (LookupResult, error) {
	if !parsed.PublicRoutable {
		return LookupResult{}, ErrNonPublicAddress
	}
	timeout := l.Timeout
	if timeout <= 0 {
		timeout = 4500 * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	resolver := l.Resolver
	if resolver == nil {
		resolver = net.DefaultResolver
	}

	var (
		wg        sync.WaitGroup
		ptrRecord string
		rdapInfo  rdapMetadata
		rdapOK    bool
		cymruASN  int64
		cymruCC   string
		cymruOrg  string
	)

	wg.Add(3)
	go func() {
		defer wg.Done()
		names, err := resolver.LookupAddr(ctx, parsed.Addr.String())
		if err == nil && len(names) > 0 {
			ptrRecord = strings.TrimSuffix(strings.TrimSpace(names[0]), ".")
		}
	}()

	go func() {
		defer wg.Done()
		if l.HTTPClient == nil || l.RDAPBaseURL == "" {
			return
		}
		info, err := queryRDAP(ctx, l.HTTPClient, l.RDAPBaseURL, parsed.Addr.String())
		if err == nil {
			rdapInfo = info
			rdapOK = true
		}
	}()

	go func() {
		defer wg.Done()
		cymruASN, cymruCC, cymruOrg = lookupCymruASN(ctx, resolver, parsed.Addr)
	}()

	wg.Wait()

	region := rdapInfo.Country
	if region == "" {
		region = cymruCC
	}
	asn := rdapInfo.ASN
	if asn == 0 {
		asn = cymruASN
	}
	org := rdapInfo.Org
	if org == "" {
		org = cymruOrg
	}

	if region == "" && asn == 0 && org == "" && ptrRecord == "" {
		return LookupResult{}, ErrLookupFailed
	}

	var sources []string
	if rdapOK || cymruASN > 0 {
		sources = append(sources, "rdap")
	}
	if ptrRecord != "" {
		sources = append(sources, "ptr")
	}
	source := strings.Join(sources, "+")
	if source == "" {
		source = "rdap"
	}

	return LookupResult{
		Address:   parsed.Canonical,
		Region:    region,
		City:      "",
		ASN:       asn,
		ASNOrg:    org,
		PTRRecord: ptrRecord,
		Source:    source,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

type rdapMetadata struct {
	Country string
	ASN     int64
	Org     string
}

type rdapPayload struct {
	Name       string       `json:"name"`
	Country    string       `json:"country"`
	OriginASNs []int64      `json:"arin_originas0_originautnums"`
	Entities   []rdapEntity `json:"entities"`
}

type rdapEntity struct {
	Roles      []string     `json:"roles"`
	VCardArray []any        `json:"vcardArray"`
	Entities   []rdapEntity `json:"entities"`
}

func extractVCardFN(vcard []any) string {
	if len(vcard) < 2 {
		return ""
	}
	rows, ok := vcard[1].([]any)
	if !ok {
		return ""
	}
	for _, rawRow := range rows {
		row, ok := rawRow.([]any)
		if !ok || len(row) < 4 {
			continue
		}
		prop, _ := row[0].(string)
		if strings.EqualFold(prop, "fn") {
			val, _ := row[3].(string)
			val = strings.TrimSpace(val)
			if val != "" {
				return val
			}
		}
	}
	return ""
}

func pickEntityOrg(entities []rdapEntity) string {
	var fallback string
	for _, ent := range entities {
		fn := extractVCardFN(ent.VCardArray)
		if fn != "" {
			for _, role := range ent.Roles {
				if role == "registrant" || role == "administrative" {
					return fn
				}
			}
			if fallback == "" {
				fallback = fn
			}
		}
		if sub := pickEntityOrg(ent.Entities); sub != "" && fallback == "" {
			fallback = sub
		}
	}
	return fallback
}

func queryRDAP(ctx context.Context, client *http.Client, baseURL, ip string) (rdapMetadata, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/" + ip
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return rdapMetadata{}, err
	}
	req.Header.Set("Accept", "application/rdap+json, application/json")
	req.Header.Set("User-Agent", "IRM-Local-Lookup/0.1")

	resp, err := client.Do(req)
	if err != nil {
		return rdapMetadata{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return rdapMetadata{}, fmt.Errorf("rdap status %d", resp.StatusCode)
	}

	var payload rdapPayload
	if err := json.NewDecoder(io.LimitReader(resp.Body, 256*1024)).Decode(&payload); err != nil {
		return rdapMetadata{}, err
	}

	country := strings.ToUpper(strings.TrimSpace(payload.Country))
	if !validRegion(country) {
		country = ""
	}
	var asn int64
	if len(payload.OriginASNs) > 0 && payload.OriginASNs[0] > 0 {
		asn = payload.OriginASNs[0]
	}
	org := pickEntityOrg(payload.Entities)
	if org == "" {
		org = strings.TrimSpace(payload.Name)
	}
	return rdapMetadata{Country: country, ASN: asn, Org: org}, nil
}

func reverseIPForCymru(addr netip.Addr) (string, bool) {
	addr = addr.Unmap()
	if addr.Is4() {
		b := addr.As4()
		return fmt.Sprintf("%d.%d.%d.%d.origin.asn.cymru.com", b[3], b[2], b[1], b[0]), true
	}
	if addr.Is6() {
		b := addr.As16()
		var parts [32]string
		const hexDigits = "0123456789abcdef"
		idx := 0
		for i := 15; i >= 0; i-- {
			parts[idx] = string(hexDigits[b[i]&0x0f])
			idx++
			parts[idx] = string(hexDigits[b[i]>>4])
			idx++
		}
		return strings.Join(parts[:], ".") + ".origin6.asn.cymru.com", true
	}
	return "", false
}

func lookupCymruASN(ctx context.Context, resolver DNSResolver, addr netip.Addr) (int64, string, string) {
	qname, ok := reverseIPForCymru(addr)
	if !ok {
		return 0, "", ""
	}
	txts, err := resolver.LookupTXT(ctx, qname)
	if err != nil || len(txts) == 0 {
		return 0, "", ""
	}
	// Example: "13335 | 1.1.1.0/24 | US | apnic | 2011-08-11"
	fields := strings.Split(txts[0], "|")
	if len(fields) < 3 {
		return 0, "", ""
	}
	asnField := strings.Fields(strings.TrimSpace(fields[0]))
	if len(asnField) == 0 {
		return 0, "", ""
	}
	asn, err := strconv.ParseInt(asnField[0], 10, 64)
	if err != nil || asn <= 0 {
		return 0, "", ""
	}
	cc := strings.ToUpper(strings.TrimSpace(fields[2]))
	if !validRegion(cc) {
		cc = ""
	}
	var org string
	asTxts, err := resolver.LookupTXT(ctx, fmt.Sprintf("AS%d.asn.cymru.com", asn))
	if err == nil && len(asTxts) > 0 {
		asFields := strings.Split(asTxts[0], "|")
		if len(asFields) >= 5 {
			org = strings.TrimSpace(asFields[4])
		}
	}
	return asn, cc, org
}
