package cloudsync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ============================================================================
// 1. Porkbun API v3
// ============================================================================

type PorkbunAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *PorkbunAdapter) ProviderKey() string { return "porkbun" }

func (a *PorkbunAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.porkbun.com/api/json/v3"
}

func (a *PorkbunAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *PorkbunAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	ak := creds.Get("apiKey")
	sk := creds.Get("secretApiKey")
	if len(ak) < 6 || len(sk) < 6 || strings.ContainsAny(ak+sk, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"apiKey": ak, "secretApiKey": sk}, MaskSecret(ak), nil
}

func (a *PorkbunAdapter) postJSON(ctx context.Context, path string, payload map[string]any, out any) (int, error) {
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL()+path, bytes.NewReader(raw))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return resp.StatusCode, ErrInvalidCredentials
	}
	if err := json.Unmarshal(body, out); err != nil {
		return resp.StatusCode, fmt.Errorf("Porkbun API (%s) 解析失败: %w", path, err)
	}
	return resp.StatusCode, nil
}

func (a *PorkbunAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	ak := clean.Get("apiKey")
	sk := clean.Get("secretApiKey")

	var pingResp struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		YourIP  string `json:"yourIp"`
	}
	code, err := a.postJSON(ctx, "/ping", map[string]any{"apikey": ak, "secretapikey": sk}, &pingResp)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	if !strings.EqualFold(pingResp.Status, "SUCCESS") {
		if code == 400 || strings.Contains(strings.ToLower(pingResp.Message), "key") || strings.Contains(strings.ToLower(pingResp.Message), "invalid") {
			return UnifiedSnapshot{}, ErrInvalidCredentials
		}
		return UnifiedSnapshot{}, fmt.Errorf("Porkbun 验证失败: %s", pingResp.Message)
	}

	var listResp struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Domains []struct {
			Domain       string `json:"domain"`
			Status       string `json:"status"`
			ExpireDate   string `json:"expireDate"`
			WhoisPrivacy any    `json:"whoisPrivacy"`
			AutoRenew    any    `json:"autoRenew"`
			SecurityLock any    `json:"securityLock"`
		} `json:"domains"`
	}
	if _, err := a.postJSON(ctx, "/domain/listAll", map[string]any{
		"apikey":        ak,
		"secretapikey":  sk,
		"start":         "0",
		"includeLabels": "yes",
	}, &listResp); err != nil {
		return UnifiedSnapshot{}, err
	}
	if !strings.EqualFold(listResp.Status, "SUCCESS") {
		return UnifiedSnapshot{}, fmt.Errorf("Porkbun 域名拉取失败: %s", listResp.Message)
	}

	snap := UnifiedSnapshot{
		Provider:  "porkbun",
		Scopes:    []string{"domain/listAll", "dns/retrieve"},
		Registrar: make(map[string]RegistrarDomainInfo),
	}

	truthyFlag := func(v any) bool {
		switch val := v.(type) {
		case bool:
			return val
		case float64:
			return val != 0
		case string:
			return val == "1" || strings.EqualFold(val, "true") || strings.EqualFold(val, "yes")
		default:
			return false
		}
	}

	for idx, dom := range listResp.Domains {
		name := strings.ToLower(strings.TrimSpace(dom.Domain))
		if name == "" {
			continue
		}
		exp := parseFlexibleDate(dom.ExpireDate)
		snap.Registrar[name] = RegistrarDomainInfo{
			Name:      name,
			ExpiresAt: exp,
			AutoRenew: truthyFlag(dom.AutoRenew),
			Privacy:   truthyFlag(dom.WhoisPrivacy),
			Locked:    truthyFlag(dom.SecurityLock),
		}

		// Best-effort DNS retrieve for first 30 domains if API Access is enabled on that domain
		var recs []SyncedDNSRecord
		if idx < 30 {
			var dnsResp struct {
				Status  string `json:"status"`
				Records []struct {
					ID      string `json:"id"`
					Name    string `json:"name"`
					Type    string `json:"type"`
					Content string `json:"content"`
					TTL     string `json:"ttl"`
				} `json:"records"`
			}
			if _, derr := a.postJSON(ctx, "/dns/retrieve/"+url.PathEscape(name), map[string]any{
				"apikey":       ak,
				"secretapikey": sk,
			}, &dnsResp); derr == nil && strings.EqualFold(dnsResp.Status, "SUCCESS") {
				for _, r := range dnsResp.Records {
					if r.Type == "NS" || r.Type == "SOA" {
						continue
					}
					ttl, _ := strconv.Atoi(r.TTL)
					recs = append(recs, SyncedDNSRecord{
						ID:      r.ID,
						Type:    r.Type,
						Name:    r.Name,
						Content: strings.Trim(r.Content, "."),
						TTL:     ttl,
					})
				}
			}
		}

		dnsProv := ""
		regOnly := len(recs) == 0
		if !regOnly {
			dnsProv = "Porkbun DNS"
		}
		snap.Zones = append(snap.Zones, ZoneSnapshot{
			ZoneID:           "porkbun:" + name,
			Name:             name,
			Status:           strings.ToLower(dom.Status),
			DNSProviderName:  dnsProv,
			ConsoleURL:       "https://porkbun.com/account/domainsSpeedy",
			DefaultPresetKey: "porkbun",
			Records:          recs,
			RegistrarOnly:    regOnly,
		})
	}
	return snap, nil
}

// ============================================================================
// 2. Spaceship API v1 (domains:read + dnsrecords:read)
// ============================================================================

type SpaceshipAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *SpaceshipAdapter) ProviderKey() string { return "spaceship" }

func (a *SpaceshipAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://spaceship.dev/api/v1"
}

func (a *SpaceshipAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *SpaceshipAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	ak := creds.Get("apiKey")
	as := creds.Get("apiSecret")
	if len(ak) < 6 || len(as) < 6 || strings.ContainsAny(ak+as, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"apiKey": ak, "apiSecret": as}, MaskSecret(ak), nil
}

func (a *SpaceshipAdapter) getJSON(ctx context.Context, ak, as, path string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL()+path, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-API-Key", ak)
	req.Header.Set("X-API-Secret", as)
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return resp.StatusCode, ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("Spaceship API (%s) 返回状态 %d", path, resp.StatusCode)
	}
	return resp.StatusCode, json.Unmarshal(body, out)
}

func (a *SpaceshipAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	ak := clean.Get("apiKey")
	as := clean.Get("apiSecret")

	var domResp struct {
		Items []struct {
			Name              string `json:"name"`
			AutoRenew         bool   `json:"autoRenew"`
			ExpirationDate    string `json:"expirationDate"`
			LifecycleStatus   string `json:"lifecycleStatus"`
			PrivacyProtection struct {
				Level string `json:"level"`
			} `json:"privacyProtection"`
			Nameservers struct {
				Provider string   `json:"provider"`
				Hosts    []string `json:"hosts"`
			} `json:"nameservers"`
		} `json:"items"`
		Total int `json:"total"`
	}
	code, err := a.getJSON(ctx, ak, as, "/domains?take=100&skip=0", &domResp)
	if err != nil {
		if code == http.StatusForbidden {
			return UnifiedSnapshot{}, ErrInvalidCredentials
		}
		return UnifiedSnapshot{}, err
	}

	snap := UnifiedSnapshot{
		Provider:  "spaceship",
		Scopes:    []string{"domains:read"},
		Registrar: make(map[string]RegistrarDomainInfo),
	}
	dnsReadable := false

	for idx, item := range domResp.Items {
		name := strings.ToLower(strings.TrimSpace(item.Name))
		if name == "" {
			continue
		}
		snap.Registrar[name] = RegistrarDomainInfo{
			Name:      name,
			ExpiresAt: parseFlexibleDate(item.ExpirationDate),
			AutoRenew: item.AutoRenew,
			Privacy:   item.PrivacyProtection.Level != "" && !strings.EqualFold(item.PrivacyProtection.Level, "public"),
		}

		var recs []SyncedDNSRecord
		isBasicNS := strings.EqualFold(item.Nameservers.Provider, "basic")
		if isBasicNS && idx < 40 {
			var recResp struct {
				Items []struct {
					Type     string `json:"type"`
					Name     string `json:"name"`
					Address  string `json:"address"`
					Cname    string `json:"cname"`
					Exchange string `json:"exchange"`
					Value    string `json:"value"`
					TTL      int    `json:"ttl"`
				} `json:"items"`
			}
			if _, rerr := a.getJSON(ctx, ak, as, "/dns/records/"+url.PathEscape(name)+"?take=200&skip=0", &recResp); rerr == nil {
				dnsReadable = true
				for i, r := range recResp.Items {
					content := firstNonEmpty(r.Address, r.Cname, r.Exchange, r.Value)
					if content == "" {
						continue
					}
					fqdn := name
					if r.Name != "" && r.Name != "@" {
						fqdn = r.Name + "." + name
					}
					recs = append(recs, SyncedDNSRecord{
						ID:      fmt.Sprintf("%s-%d", r.Type, i),
						Type:    r.Type,
						Name:    fqdn,
						Content: strings.Trim(content, "."),
						TTL:     r.TTL,
					})
				}
			}
		}

		dnsProv := ""
		if isBasicNS {
			dnsProv = "Spaceship DNS"
		}
		snap.Zones = append(snap.Zones, ZoneSnapshot{
			ZoneID:           "spaceship:" + name,
			Name:             name,
			Status:           "active",
			NameServers:      item.Nameservers.Hosts,
			DNSProviderName:  dnsProv,
			ConsoleURL:       "https://www.spaceship.com/application/domain-list-application/",
			DefaultPresetKey: "spaceship",
			Records:          recs,
			RegistrarOnly:    !isBasicNS && len(recs) == 0,
		})
	}
	if dnsReadable {
		snap.Scopes = append(snap.Scopes, "dnsrecords:read")
	}
	return snap, nil
}

// ============================================================================
// 3. Vercel REST API (Domains + Projects)
// ============================================================================

type VercelAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *VercelAdapter) ProviderKey() string { return "vercel" }

func (a *VercelAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.vercel.com"
}

func (a *VercelAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *VercelAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	tok := creds.Get("apiToken")
	if len(tok) < 12 || strings.ContainsAny(tok, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	out := Credentials{"apiToken": tok}
	if team := creds.Get("teamId"); team != "" {
		out["teamId"] = team
	}
	return out, MaskSecret(tok), nil
}

func (a *VercelAdapter) getJSON(ctx context.Context, tok, teamID, path string, out any) (int, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := a.baseURL() + path
	if teamID != "" {
		fullURL += sep + "teamId=" + url.QueryEscape(teamID)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return resp.StatusCode, ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("Vercel API (%s) 返回状态 %d", path, resp.StatusCode)
	}
	return resp.StatusCode, json.Unmarshal(body, out)
}

func (a *VercelAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	tok := clean.Get("apiToken")
	teamID := clean.Get("teamId")

	snap := UnifiedSnapshot{
		Provider:  "vercel",
		Scopes:    []string{"domains:read", "projects:read"},
		Registrar: make(map[string]RegistrarDomainInfo),
	}

	if teamID != "" {
		var teamResp struct {
			Name string `json:"name"`
			Slug string `json:"slug"`
		}
		if _, err := a.getJSON(ctx, tok, teamID, "/v2/teams/"+url.PathEscape(teamID), &teamResp); err == nil {
			if n := firstNonEmpty(teamResp.Name, teamResp.Slug); n != "" {
				snap.AccountNames = []string{n}
			}
		}
	} else {
		var userResp struct {
			User struct {
				Username string `json:"username"`
				Email    string `json:"email"`
			} `json:"user"`
		}
		if _, err := a.getJSON(ctx, tok, "", "/v2/user", &userResp); err != nil {
			return UnifiedSnapshot{}, err
		}
		if n := firstNonEmpty(userResp.User.Username, userResp.User.Email); n != "" {
			snap.AccountNames = []string{n}
		}
	}

	var domResp struct {
		Domains []struct {
			ID          string   `json:"id"`
			Name        string   `json:"name"`
			ServiceType string   `json:"serviceType"`
			ExpiresAt   *int64   `json:"expiresAt"`
			Renew       bool     `json:"renew"`
			Nameservers []string `json:"nameservers"`
		} `json:"domains"`
	}
	if _, err := a.getJSON(ctx, tok, teamID, "/v5/domains?limit=100", &domResp); err != nil {
		return UnifiedSnapshot{}, err
	}

	for idx, d := range domResp.Domains {
		name := strings.ToLower(strings.TrimSpace(d.Name))
		if name == "" {
			continue
		}
		if d.ExpiresAt != nil && *d.ExpiresAt > 0 {
			snap.Registrar[name] = RegistrarDomainInfo{
				Name:      name,
				ExpiresAt: time.UnixMilli(*d.ExpiresAt).UTC().Format("2006-01-02"),
				AutoRenew: d.Renew,
				Privacy:   true,
			}
		}

		var recs []SyncedDNSRecord
		if idx < 35 {
			var recResp struct {
				Records []struct {
					ID    string `json:"id"`
					Name  string `json:"name"`
					Type  string `json:"type"`
					Value string `json:"value"`
					TTL   int    `json:"ttl"`
				} `json:"records"`
			}
			if _, rerr := a.getJSON(ctx, tok, teamID, "/v4/domains/"+url.PathEscape(name)+"/records?limit=100", &recResp); rerr == nil {
				for _, r := range recResp.Records {
					if r.Type == "NS" || r.Type == "SOA" {
						continue
					}
					fqdn := name
					if r.Name != "" && r.Name != "@" {
						fqdn = r.Name + "." + name
					}
					recs = append(recs, SyncedDNSRecord{
						ID:      r.ID,
						Type:    r.Type,
						Name:    fqdn,
						Content: strings.Trim(r.Value, "."),
						TTL:     r.TTL,
					})
				}
			}
		}

		snap.Zones = append(snap.Zones, ZoneSnapshot{
			ZoneID:           "vercel:" + firstNonEmpty(d.ID, name),
			Name:             name,
			Status:           "active",
			NameServers:      d.Nameservers,
			DNSProviderName:  "Vercel DNS",
			ConsoleURL:       "https://vercel.com/dashboard/domains",
			DefaultPresetKey: "vercel_domains",
			Records:          recs,
			RegistrarOnly:    len(recs) == 0 && !strings.EqualFold(d.ServiceType, "zeit.world"),
		})
	}

	var projResp struct {
		Projects []struct {
			Name    string `json:"name"`
			Targets map[string]struct {
				Alias []string `json:"alias"`
			} `json:"targets"`
		} `json:"projects"`
	}
	if _, perr := a.getJSON(ctx, tok, teamID, "/v9/projects?limit=100", &projResp); perr == nil {
		for _, p := range projResp.Projects {
			var aliases []string
			if prod, ok := p.Targets["production"]; ok {
				aliases = append(aliases, prod.Alias...)
			}
			if len(aliases) > 0 {
				snap.Pages = append(snap.Pages, SyncedPagesProject{
					Name:      p.Name,
					Subdomain: p.Name + ".vercel.app",
					Domains:   aliases,
				})
			}
		}
	}

	return snap, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}
