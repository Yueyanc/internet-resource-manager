package domainname

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
)

var ErrDomainLookupFailed = errors.New("无法从 RDAP 或 WHOIS 获取该域名的注册与到期信息")

type LookupResult struct {
	Domain         string   `json:"domain"`
	ApexDomain     string   `json:"apexDomain"`
	Registrar      string   `json:"registrar"`
	RawRegistrar   string   `json:"rawRegistrar,omitempty"`
	DNSProvider    string   `json:"dnsProvider"`
	PresetKey      string   `json:"presetKey"`
	ExpireDate     string   `json:"expireDate"`
	RegisteredDate string   `json:"registeredDate,omitempty"`
	NameServers    []string `json:"nameServers"`
	RegistryStatus []string `json:"registryStatus,omitempty"`
	TransferLocked bool     `json:"transferLocked"`
	Source         string   `json:"source"`
	CheckedAt      string   `json:"checkedAt"`
}

type Lookuper interface {
	Lookup(ctx context.Context, fqdn string) (LookupResult, error)
}

type WHOISDialerFunc func(ctx context.Context, serverHost, query string) (string, error)

type DefaultLookuper struct {
	RDAPBaseURL string
	HTTPClient  *http.Client
	Resolver    ipaddr.DNSResolver
	WHOISQuery  WHOISDialerFunc
	Timeout     time.Duration
}

var compoundSecondLevelTLDs = map[string]struct{}{
	"com.cn": {}, "net.cn": {}, "org.cn": {}, "gov.cn": {}, "edu.cn": {}, "ac.cn": {}, "mil.cn": {},
	"ah.cn": {}, "bj.cn": {}, "cq.cn": {}, "fj.cn": {}, "gd.cn": {}, "gs.cn": {}, "gz.cn": {},
	"gx.cn": {}, "ha.cn": {}, "hb.cn": {}, "he.cn": {}, "hi.cn": {}, "hk.cn": {}, "hl.cn": {},
	"hn.cn": {}, "jl.cn": {}, "js.cn": {}, "jx.cn": {}, "ln.cn": {}, "mo.cn": {}, "nm.cn": {},
	"nx.cn": {}, "qh.cn": {}, "sc.cn": {}, "sd.cn": {}, "sh.cn": {}, "sn.cn": {}, "sx.cn": {},
	"tj.cn": {}, "tw.cn": {}, "xj.cn": {}, "xz.cn": {}, "yn.cn": {}, "zj.cn": {},
	"co.uk": {}, "org.uk": {}, "me.uk": {}, "ltd.uk": {}, "plc.uk": {}, "ac.uk": {}, "gov.uk": {},
	"co.jp": {}, "ne.jp": {}, "or.jp": {}, "ac.jp": {}, "go.jp": {}, "gr.jp": {}, "ed.jp": {},
	"com.hk": {}, "org.hk": {}, "net.hk": {}, "edu.hk": {}, "gov.hk": {}, "idv.hk": {},
	"com.tw": {}, "org.tw": {}, "net.tw": {}, "idv.tw": {}, "game.tw": {}, "club.tw": {},
	"com.au": {}, "net.au": {}, "org.au": {}, "id.au": {},
	"co.nz": {}, "net.nz": {}, "org.nz": {},
	"com.sg": {}, "org.sg": {}, "net.sg": {},
	"co.kr": {}, "or.kr": {}, "ne.kr": {},
	"co.in": {}, "net.in": {}, "org.in": {},
	"com.br": {}, "net.br": {}, "org.br": {},
	"com.my": {}, "com.mx": {}, "co.za": {}, "com.tr": {}, "com.ru": {}, "com.ua": {},
}

// ExtractApex extracts the registrable apex domain from a normalized FQDN.
func ExtractApex(fqdn string) (apex string, tld string) {
	clean := strings.Trim(strings.ToLower(strings.TrimSpace(fqdn)), ".")
	labels := strings.Split(clean, ".")
	if len(labels) < 2 {
		return clean, clean
	}
	lastTwo := labels[len(labels)-2] + "." + labels[len(labels)-1]
	if len(labels) >= 3 {
		if _, compound := compoundSecondLevelTLDs[lastTwo]; compound {
			return labels[len(labels)-3] + "." + lastTwo, lastTwo
		}
	}
	return lastTwo, labels[len(labels)-1]
}

var fastWHOISServers = map[string]string{
	"cn":  "whois.cnnic.cn",
	"hk":  "whois.hkirc.hk",
	"tw":  "whois.twnic.net.tw",
	"jp":  "whois.jprs.jp",
	"kr":  "whois.kr",
	"sg":  "whois.sgnic.sg",
	"io":  "whois.nic.io",
	"ai":  "whois.nic.ai",
	"me":  "whois.nic.me",
	"co":  "whois.registry.co",
	"cc":  "ccwhois.verisign-grs.com",
	"tv":  "tvwhois.verisign-grs.com",
	"com": "whois.verisign-grs.com",
	"net": "whois.verisign-grs.com",
	"org": "whois.pir.org",
	"uk":  "whois.nic.uk",
	"de":  "whois.denic.de",
	"eu":  "whois.eu",
	"fr":  "whois.nic.fr",
	"nl":  "whois.domain-registry.nl",
	"ch":  "whois.nic.ch",
	"li":  "whois.nic.li",
	"it":  "whois.nic.it",
	"ca":  "whois.cira.ca",
	"au":  "whois.auda.org.au",
	"us":  "whois.nic.us",
	"in":  "whois.registry.in",
	"sh":  "whois.nic.sh",
	"ac":  "whois.nic.ac",
	"gg":  "whois.gg",
	"im":  "whois.nic.im",
	"la":  "whois.nic.la",
	"so":  "whois.nic.so",
	"ru":  "whois.tcinet.ru",
}

func NewPublicHTTPSClient(resolver ipaddr.DNSResolver, timeout time.Duration) *http.Client {
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second}
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
				return nil, errors.New("disallowed external http port")
			}
			ips, err := resolver.LookupNetIP(ctx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("resolve host: %w", err)
			}
			for _, candidate := range ips {
				unmapped := candidate.Unmap()
				if !ipaddr.IsPublicRoutable(unmapped) {
					return nil, errors.New("external host resolved to non-public address")
				}
			}
			target := netip.AddrPortFrom(ips[0].Unmap(), uint16(port))
			return dialer.DialContext(ctx, network, target.String())
		},
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 6 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "https" || req.URL.User != nil {
				return errors.New("disallowed redirect target")
			}
			return nil
		},
	}
}

func NewDefaultLookuper() *DefaultLookuper {
	resolver := net.DefaultResolver
	timeout := 8 * time.Second
	l := &DefaultLookuper{
		RDAPBaseURL: "https://rdap.org/domain",
		HTTPClient:  NewPublicHTTPSClient(resolver, timeout),
		Resolver:    resolver,
		Timeout:     timeout,
	}
	l.WHOISQuery = l.defaultWHOISQuery
	return l
}

func (l *DefaultLookuper) defaultWHOISQuery(ctx context.Context, serverHost, query string) (string, error) {
	host := strings.Trim(strings.ToLower(strings.TrimSpace(serverHost)), ".")
	if host == "" || strings.ContainsAny(host, " \t\r\n/:@") {
		return "", errors.New("invalid whois server host")
	}
	resolver := l.Resolver
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	ips, err := resolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return "", fmt.Errorf("resolve whois server: %w", err)
	}
	for _, candidate := range ips {
		if !ipaddr.IsPublicRoutable(candidate.Unmap()) {
			return "", errors.New("whois server resolved to non-public address")
		}
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", netip.AddrPortFrom(ips[0].Unmap(), 43).String())
	if err != nil {
		return "", err
	}
	defer func() { _ = conn.Close() }()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	}

	cleanQuery := strings.NewReplacer("\r", "", "\n", "").Replace(strings.TrimSpace(query))
	if _, err := io.WriteString(conn, cleanQuery+"\r\n"); err != nil {
		return "", err
	}
	raw, err := io.ReadAll(io.LimitReader(conn, 128*1024))
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func (l *DefaultLookuper) Lookup(ctx context.Context, rawDomain string) (LookupResult, error) {
	normalized, err := NormalizeName(rawDomain)
	if err != nil {
		return LookupResult{}, &ValidationError{Code: "invalid_domain", Message: "请输入有效域名，不包含协议、路径或端口"}
	}
	apex, suffix := ExtractApex(normalized)
	topTLD := suffix
	if idx := strings.LastIndexByte(suffix, '.'); idx >= 0 {
		topTLD = suffix[idx+1:]
	}

	timeout := l.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var (
		res    LookupResult
		source string
	)

	if l.HTTPClient != nil && l.RDAPBaseURL != "" {
		if rdapRes, rdapErr := queryDomainRDAP(ctx, l.HTTPClient, l.RDAPBaseURL, apex); rdapErr == nil {
			res = rdapRes
			source = "rdap"
		}
	}

	if (res.ExpireDate == "" || res.RawRegistrar == "") && l.WHOISQuery != nil {
		if whoisRes, whoisErr := l.lookupWHOIS(ctx, apex, topTLD); whoisErr == nil {
			if res.ExpireDate == "" && whoisRes.ExpireDate != "" {
				res.ExpireDate = whoisRes.ExpireDate
			}
			if res.RawRegistrar == "" && whoisRes.RawRegistrar != "" {
				res.RawRegistrar = whoisRes.RawRegistrar
			}
			if res.RegisteredDate == "" && whoisRes.RegisteredDate != "" {
				res.RegisteredDate = whoisRes.RegisteredDate
			}
			if len(res.NameServers) == 0 && len(whoisRes.NameServers) > 0 {
				res.NameServers = whoisRes.NameServers
			}
			if len(res.RegistryStatus) == 0 && len(whoisRes.RegistryStatus) > 0 {
				res.RegistryStatus = whoisRes.RegistryStatus
			}
			if whoisRes.TransferLocked {
				res.TransferLocked = true
			}
			if source == "rdap" {
				source = "rdap+whois"
			} else {
				source = "whois"
			}
		}
	}

	if res.ExpireDate == "" && res.RawRegistrar == "" && len(res.NameServers) == 0 {
		return LookupResult{}, ErrDomainLookupFailed
	}

	presetKey, friendlyRegistrar, friendlyDNS := InferPresetAndProviders(res.RawRegistrar, res.NameServers)
	res.Domain = normalized
	res.ApexDomain = apex
	res.Registrar = friendlyRegistrar
	res.DNSProvider = friendlyDNS
	res.PresetKey = presetKey
	res.Source = source
	res.CheckedAt = time.Now().UTC().Format(time.RFC3339)
	if res.NameServers == nil {
		res.NameServers = []string{}
	}
	return res, nil
}

type rdapDomainPayload struct {
	LDHName     string             `json:"ldhName"`
	Status      []string           `json:"status"`
	Events      []rdapDomainEvent  `json:"events"`
	Entities    []rdapDomainEntity `json:"entities"`
	NameServers []rdapDomainNS     `json:"nameservers"`
}

type rdapDomainEvent struct {
	EventAction string `json:"eventAction"`
	EventDate   string `json:"eventDate"`
}

type rdapDomainNS struct {
	LDHName string `json:"ldhName"`
}

type rdapDomainEntity struct {
	Handle     string             `json:"handle"`
	Roles      []string           `json:"roles"`
	VCardArray []any              `json:"vcardArray"`
	Entities   []rdapDomainEntity `json:"entities"`
}

func extractRDAPVCardFN(vcard []any) string {
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
		if strings.EqualFold(prop, "fn") || strings.EqualFold(prop, "org") {
			if val, ok := row[3].(string); ok && strings.TrimSpace(val) != "" {
				return strings.TrimSpace(val)
			}
		}
	}
	return ""
}

func findRDAPRegistrar(entities []rdapDomainEntity) string {
	for _, ent := range entities {
		isReg := false
		for _, role := range ent.Roles {
			if strings.EqualFold(role, "registrar") || strings.EqualFold(role, "sponsor") {
				isReg = true
				break
			}
		}
		if isReg {
			if fn := extractRDAPVCardFN(ent.VCardArray); fn != "" {
				return fn
			}
			if sub := findRDAPRegistrar(ent.Entities); sub != "" {
				return sub
			}
			if strings.TrimSpace(ent.Handle) != "" {
				return strings.TrimSpace(ent.Handle)
			}
		}
		if sub := findRDAPRegistrar(ent.Entities); sub != "" {
			return sub
		}
	}
	return ""
}

func parseFlexibleDate(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Strip trailing parenthetical notes like "(UTC+8)" or "Z"
	if idx := strings.IndexByte(s, '('); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}
	s = strings.TrimSuffix(s, ".")
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z0700",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04:05 MST",
		"2006-01-02",
		"2006/01/02 15:04:05",
		"2006/01/02",
		"2006.01.02 15:04:05",
		"2006.01.02",
		"02-Jan-2006",
		"02-Jan-2006 15:04:05 UTC",
		"2006-Jan-02",
		"January 02 2006",
		"02/01/2006",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Format("2006-01-02")
		}
	}
	dateRe := regexp.MustCompile(`\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b`)
	if m := dateRe.FindStringSubmatch(s); len(m) == 4 {
		candidate := m[1] + "-" + m[2] + "-" + m[3]
		if _, err := time.Parse("2006-01-02", candidate); err == nil {
			return candidate
		}
	}
	return ""
}

func queryDomainRDAP(ctx context.Context, client *http.Client, baseURL, apex string) (LookupResult, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/" + apex
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return LookupResult{}, err
	}
	req.Header.Set("Accept", "application/rdap+json, application/json")
	req.Header.Set("User-Agent", "IRM-Domain-Lookup/0.1")

	resp, err := client.Do(req)
	if err != nil {
		return LookupResult{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return LookupResult{}, fmt.Errorf("rdap status %d", resp.StatusCode)
	}

	var payload rdapDomainPayload
	if err := json.NewDecoder(io.LimitReader(resp.Body, 512*1024)).Decode(&payload); err != nil {
		return LookupResult{}, err
	}

	var res LookupResult
	res.RawRegistrar = findRDAPRegistrar(payload.Entities)
	for _, ev := range payload.Events {
		action := strings.ToLower(strings.TrimSpace(ev.EventAction))
		switch action {
		case "expiration", "registrar expiration":
			if d := parseFlexibleDate(ev.EventDate); d != "" {
				res.ExpireDate = d
			}
		case "registration":
			if d := parseFlexibleDate(ev.EventDate); d != "" {
				res.RegisteredDate = d
			}
		}
	}

	seenNS := make(map[string]struct{})
	for _, ns := range payload.NameServers {
		cleanNS := strings.Trim(strings.ToLower(strings.TrimSpace(ns.LDHName)), ".")
		if cleanNS == "" {
			continue
		}
		if _, ok := seenNS[cleanNS]; !ok {
			seenNS[cleanNS] = struct{}{}
			res.NameServers = append(res.NameServers, cleanNS)
		}
	}
	for _, st := range payload.Status {
		cleanSt := strings.TrimSpace(st)
		if cleanSt == "" {
			continue
		}
		res.RegistryStatus = append(res.RegistryStatus, cleanSt)
		lowerSt := strings.ToLower(cleanSt)
		if strings.Contains(lowerSt, "transfer prohibited") || strings.Contains(lowerSt, "transferprohibited") {
			res.TransferLocked = true
		}
	}

	if res.ExpireDate == "" && res.RawRegistrar == "" && len(res.NameServers) == 0 {
		return LookupResult{}, ErrDomainLookupFailed
	}
	return res, nil
}

func (l *DefaultLookuper) lookupWHOIS(ctx context.Context, apex, topTLD string) (LookupResult, error) {
	server, ok := fastWHOISServers[topTLD]
	if !ok {
		ianaText, err := l.WHOISQuery(ctx, "whois.iana.org", topTLD)
		if err == nil {
			server = parseIANARefer(ianaText)
		}
	}
	if server == "" {
		return LookupResult{}, ErrDomainLookupFailed
	}

	query := apex
	if strings.Contains(server, "verisign-grs.com") {
		query = "domain " + apex
	} else if server == "whois.jprs.jp" {
		query = apex + "/e"
	} else if server == "whois.denic.de" {
		query = "-T dn,ace " + apex
	}

	raw, err := l.WHOISQuery(ctx, server, query)
	if err != nil {
		return LookupResult{}, err
	}
	return ParseWHOISText(raw), nil
}

func parseIANARefer(raw string) string {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "refer:") || strings.HasPrefix(lower, "whois:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				srv := strings.TrimSpace(parts[1])
				if srv != "" {
					return srv
				}
			}
		}
	}
	return ""
}

func ParseWHOISText(raw string) LookupResult {
	var res LookupResult
	seenNS := make(map[string]struct{})

	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "%") || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ">>>") {
			continue
		}

		// Handle JPRS bracket style e.g. "[Expires on] 2027/05/31"
		if strings.HasPrefix(line, "[") {
			if end := strings.IndexByte(line, ']'); end > 1 {
				key := strings.ToLower(strings.TrimSpace(line[1:end]))
				val := strings.TrimSpace(line[end+1:])
				switch key {
				case "expires on", "有効期限", "state":
					if d := parseFlexibleDate(val); d != "" && res.ExpireDate == "" {
						res.ExpireDate = d
					}
				case "registered date", "登録年月日":
					if d := parseFlexibleDate(val); d != "" && res.RegisteredDate == "" {
						res.RegisteredDate = d
					}
				case "name server":
					ns := firstTokenDomain(val)
					if ns != "" {
						if _, exists := seenNS[ns]; !exists {
							seenNS[ns] = struct{}{}
							res.NameServers = append(res.NameServers, ns)
						}
					}
				}
				continue
			}
		}

		idx := strings.IndexByte(line, ':')
		if idx <= 0 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(line[:idx]))
		val := strings.TrimSpace(line[idx+1:])
		if val == "" {
			continue
		}

		switch key {
		case "registry expiry date",
			"registrar registration expiration date",
			"expiration time",
			"expiration date",
			"expiry date",
			"expire date",
			"expires on",
			"expires",
			"paid-till",
			"renewal date",
			"valid until":
			if res.ExpireDate == "" {
				if d := parseFlexibleDate(val); d != "" {
					res.ExpireDate = d
				}
			}
		case "creation date",
			"registration time",
			"registered on",
			"created",
			"created on",
			"domain Name Commencement Date":
			if res.RegisteredDate == "" {
				if d := parseFlexibleDate(val); d != "" {
					res.RegisteredDate = d
				}
			}
		case "registrar",
			"sponsoring registrar",
			"registrar name",
			"authorized agency":
			if res.RawRegistrar == "" {
				res.RawRegistrar = val
			}
		case "name server", "nameserver", "nserver", "host name":
			ns := firstTokenDomain(val)
			if ns != "" {
				if _, exists := seenNS[ns]; !exists {
					seenNS[ns] = struct{}{}
					res.NameServers = append(res.NameServers, ns)
				}
			}
		case "domain status", "status":
			res.RegistryStatus = append(res.RegistryStatus, val)
			lowerVal := strings.ToLower(val)
			if strings.Contains(lowerVal, "clienttransferprohibited") || strings.Contains(lowerVal, "transfer prohibited") {
				res.TransferLocked = true
			}
		}
	}
	return res
}

func firstTokenDomain(val string) string {
	fields := strings.Fields(val)
	if len(fields) == 0 {
		return ""
	}
	cand := strings.Trim(strings.ToLower(fields[0]), ".")
	if strings.Contains(cand, ".") && !strings.ContainsAny(cand, "/:@") {
		return cand
	}
	return ""
}

// InferPresetAndProviders maps raw RDAP/WHOIS registrar names and authoritative NS records
// into IRM's domain preset key, clean registrar display name, and DNS provider name.
func InferPresetAndProviders(rawRegistrar string, nameServers []string) (presetKey, registrar, dnsProvider string) {
	regClean := strings.TrimSpace(rawRegistrar)
	regLower := strings.ToLower(regClean)

	type regRule struct {
		keywords  []string
		preset    string
		registrar string
		defaultNS string
	}
	rules := []regRule{
		{[]string{"cloudflare"}, "cloudflare", "Cloudflare", "Cloudflare DNS"},
		{[]string{"porkbun"}, "porkbun", "Porkbun", "Porkbun DNS"},
		{[]string{"spaceship"}, "spaceship", "Spaceship", "Spaceship DNS"},
		{[]string{"namecheap"}, "namecheap", "Namecheap", "Namecheap BasicDNS"},
		{[]string{"alibaba", "aliyun", "hichina", "万网", "阿里云"}, "aliyun_wanwang", "阿里云万网", "阿里云云解析 DNS"},
		{[]string{"dnspod", "tencent", "烟台帝思普", "腾讯", "新网数码"}, "tencent_dnspod", "腾讯云 DNSPod", "DNSPod 解析"},
		{[]string{"namesilo"}, "namesilo", "NameSilo", "NameSilo DNS"},
		{[]string{"dynadot"}, "dynadot", "Dynadot", "Dynadot DNS"},
		{[]string{"amazon", "gandi"}, "aws_route53", "AWS Route 53", "Amazon Route 53"},
		{[]string{"squarespace", "google"}, "google_cloud_dns", "Squarespace / Google", "Google Cloud DNS"},
		{[]string{"ovh"}, "ovh_domains", "OVHcloud", "OVH Anycast DNS"},
		{[]string{"west263", "西部数码"}, "", "西部数码", ""},
		{[]string{"xinnet", "新网"}, "", "新网", ""},
		{[]string{"godaddy"}, "", "GoDaddy", ""},
	}

	registrar = regClean
	for _, rule := range rules {
		matched := false
		for _, kw := range rule.keywords {
			if strings.Contains(regLower, kw) {
				matched = true
				break
			}
		}
		if matched {
			presetKey = rule.preset
			registrar = rule.registrar
			dnsProvider = rule.defaultNS
			break
		}
	}

	// Inspect actual authoritative NS records to detect split Registrar vs DNS Provider (e.g. Porkbun + Cloudflare DNS!)
	nsJoined := strings.ToLower(strings.Join(nameServers, " "))
	switch {
	case strings.Contains(nsJoined, ".ns.cloudflare.com"):
		dnsProvider = "Cloudflare DNS"
		if presetKey == "" {
			presetKey = "cloudflare"
		}
	case strings.Contains(nsJoined, "hichina.com") || strings.Contains(nsJoined, "alidns.com"):
		dnsProvider = "阿里云云解析 DNS"
		if presetKey == "" {
			presetKey = "aliyun_wanwang"
		}
	case strings.Contains(nsJoined, "dnspod.net"):
		dnsProvider = "DNSPod 解析"
		if presetKey == "" {
			presetKey = "tencent_dnspod"
		}
	case strings.Contains(nsJoined, "porkbun.com"):
		dnsProvider = "Porkbun DNS"
		if presetKey == "" {
			presetKey = "porkbun"
		}
	case strings.Contains(nsJoined, "spaceship.net") || strings.Contains(nsJoined, "launch1.spaceship"):
		dnsProvider = "Spaceship DNS"
		if presetKey == "" {
			presetKey = "spaceship"
		}
	case strings.Contains(nsJoined, "registrar-servers.com"):
		dnsProvider = "Namecheap BasicDNS"
		if presetKey == "" {
			presetKey = "namecheap"
		}
	case strings.Contains(nsJoined, "dnsowl.com"):
		dnsProvider = "NameSilo DNS"
		if presetKey == "" {
			presetKey = "namesilo"
		}
	case strings.Contains(nsJoined, "dynadot.com"):
		dnsProvider = "Dynadot DNS"
		if presetKey == "" {
			presetKey = "dynadot"
		}
	case strings.Contains(nsJoined, "awsdns-"):
		dnsProvider = "Amazon Route 53"
		if presetKey == "" {
			presetKey = "aws_route53"
		}
	case strings.Contains(nsJoined, "vercel-dns.com"):
		dnsProvider = "Vercel Edge DNS"
		if presetKey == "" {
			presetKey = "vercel_domains"
		}
	case strings.Contains(nsJoined, "googledomains.com") || strings.Contains(nsJoined, "ns-cloud-"):
		dnsProvider = "Google Cloud DNS"
		if presetKey == "" {
			presetKey = "google_cloud_dns"
		}
	case strings.Contains(nsJoined, "digitalocean.com"):
		dnsProvider = "DigitalOcean DNS"
		if presetKey == "" {
			presetKey = "digitalocean_dns"
		}
	case strings.Contains(nsJoined, "ovh.net"):
		dnsProvider = "OVH Anycast DNS"
		if presetKey == "" {
			presetKey = "ovh_domains"
		}
	}

	return presetKey, registrar, dnsProvider
}
