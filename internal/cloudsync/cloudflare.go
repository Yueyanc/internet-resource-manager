package cloudsync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
)

var (
	ErrInvalidToken    = errors.New("Cloudflare API 令牌无效或已失效")
	ErrUpstreamUnavail = errors.New("无法连接 Cloudflare API，请检查网络连通性")
)

type PermissionSpec struct {
	Key         string `json:"key"`
	Type        string `json:"type"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type TokenTemplateInfo struct {
	UserTokenURL    string           `json:"userTokenUrl"`
	AccountTokenURL string           `json:"accountTokenUrl"`
	TokenName       string           `json:"tokenName"`
	Permissions     []PermissionSpec `json:"permissions"`
}

func CloudflareTokenTemplates() TokenTemplateInfo {
	perms := []PermissionSpec{
		{Key: "zone", Type: "read", Label: "Zone · Read", Description: "读取名下托管域名、套餐与权威 NS"},
		{Key: "dns", Type: "read", Label: "DNS · Read", Description: "读取解析记录并自动关联服务器与 IP 节点"},
		{Key: "argotunnel", Type: "read", Label: "Cloudflare Tunnel · Read", Description: "读取内网穿透隧道在线状态与子域路由"},
		{Key: "page", Type: "read", Label: "Cloudflare Pages · Read", Description: "读取 Pages 项目与绑定自定义域名"},
		{Key: "workers_scripts", Type: "read", Label: "Workers Scripts · Read", Description: "读取无服务器边缘脚本"},
		{Key: "workers_routes", Type: "read", Label: "Workers Routes · Read", Description: "读取域名关联的 Workers 路由规则"},
	}

	type rawPerm struct {
		Key  string `json:"key"`
		Type string `json:"type"`
	}
	rawList := make([]rawPerm, 0, len(perms))
	for _, p := range perms {
		rawList = append(rawList, rawPerm{Key: p.Key, Type: p.Type})
	}
	permJSON, _ := json.Marshal(rawList)
	tokenName := "IRM Read-Only Sync"

	userQ := url.Values{}
	userQ.Set("permissionGroupKeys", string(permJSON))
	userQ.Set("accountId", "*")
	userQ.Set("zoneId", "all")
	userQ.Set("name", tokenName)

	acctQ := url.Values{}
	acctQ.Set("to", "/:account/api-tokens")
	acctQ.Set("permissionGroupKeys", string(permJSON))
	acctQ.Set("name", tokenName)

	return TokenTemplateInfo{
		UserTokenURL:    "https://dash.cloudflare.com/profile/api-tokens?" + userQ.Encode(),
		AccountTokenURL: "https://dash.cloudflare.com/?" + acctQ.Encode(),
		TokenName:       tokenName,
		Permissions:     perms,
	}
}

type CloudflareCredentials struct {
	APIToken string `json:"apiToken"`
}

type VerifySummary struct {
	AccountNames []string `json:"accountNames"`
	Scopes       []string `json:"scopes"`
	ZonesCount   int      `json:"zonesCount"`
}

type SyncedDNSRecord struct {
	ID               string   `json:"id"`
	Type             string   `json:"type"`
	Name             string   `json:"name"`
	Content          string   `json:"content"`
	Proxied          bool     `json:"proxied"`
	TTL              int      `json:"ttl"`
	MatchedServerIDs []string `json:"matchedServerIds,omitempty"`
	MatchedIPIDs     []string `json:"matchedIpIds,omitempty"`
}

type SyncedTunnelRoute struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Hostname string `json:"hostname,omitempty"`
	Service  string `json:"service,omitempty"`
}

type SyncedPagesProject struct {
	Name      string   `json:"name"`
	Subdomain string   `json:"subdomain,omitempty"`
	Domains   []string `json:"domains,omitempty"`
}

type DomainEdgeMeta struct {
	Provider      string               `json:"provider,omitempty"`
	AccountName   string               `json:"accountName,omitempty"`
	Plan          string               `json:"plan,omitempty"`
	ZoneStatus    string               `json:"zoneStatus,omitempty"`
	NameServers   []string             `json:"nameServers,omitempty"`
	ProxiedCount  int                  `json:"proxiedCount"`
	TotalRecords  int                  `json:"totalRecords"`
	WorkerRoutes  []string             `json:"workerRoutes,omitempty"`
	Tunnels       []SyncedTunnelRoute  `json:"tunnels,omitempty"`
	PagesProjects []SyncedPagesProject `json:"pagesProjects,omitempty"`
}

type RegistrarDomainInfo struct {
	Name      string
	ExpiresAt string
	AutoRenew bool
	Privacy   bool
	Locked    bool
}

type ZoneSnapshot struct {
	ZoneID       string
	Name         string
	Status       string
	Paused       bool
	PlanName     string
	AccountID    string
	AccountName  string
	NameServers  []string
	Records      []SyncedDNSRecord
	WorkerRoutes []string
}

type Snapshot struct {
	AccountNames []string
	Scopes       []string
	Zones        []ZoneSnapshot
	Registrar    map[string]RegistrarDomainInfo
	Tunnels      []SyncedTunnelRoute
	Pages        []SyncedPagesProject
}

type CloudflareClient interface {
	Verify(ctx context.Context, apiToken string) (VerifySummary, error)
	FetchSnapshot(ctx context.Context, apiToken string) (Snapshot, error)
}

type HTTPCloudflareClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewCloudflareClient() *HTTPCloudflareClient {
	return &HTTPCloudflareClient{
		BaseURL:    "https://api.cloudflare.com/client/v4",
		HTTPClient: domainname.NewPublicHTTPSClient(nil, 20*time.Second),
	}
}

type cfEnvelope[T any] struct {
	Success    bool         `json:"success"`
	Result     T            `json:"result"`
	Errors     []cfAPIError `json:"errors"`
	ResultInfo *struct {
		Page       int `json:"page"`
		PerPage    int `json:"per_page"`
		TotalPages int `json:"total_pages"`
		TotalCount int `json:"total_count"`
	} `json:"result_info,omitempty"`
}

type cfAPIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func ValidateTokenFormat(raw string) (string, error) {
	tok := strings.TrimSpace(raw)
	if len(tok) < 16 || len(tok) > 256 || strings.ContainsAny(tok, " \t\r\n") {
		return "", ErrInvalidToken
	}
	return tok, nil
}

func (c *HTTPCloudflareClient) getJSON(ctx context.Context, token, relPath string, out any) (int, error) {
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = "https://api.cloudflare.com/client/v4"
	}
	client := c.HTTPClient
	if client == nil {
		client = domainname.NewPublicHTTPSClient(nil, 20*time.Second)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+relPath, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "IRM-Cloudflare-Sync/0.1")

	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return resp.StatusCode, ErrInvalidToken
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp.StatusCode, fmt.Errorf("cloudflare status %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return resp.StatusCode, err
	}
	return resp.StatusCode, nil
}

type cfAccount struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type cfZone struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	Paused      bool      `json:"paused"`
	NameServers []string  `json:"name_servers"`
	Account     cfAccount `json:"account"`
	Plan        struct {
		Name string `json:"name"`
	} `json:"plan"`
}

func (c *HTTPCloudflareClient) Verify(ctx context.Context, rawToken string) (VerifySummary, error) {
	token, err := ValidateTokenFormat(rawToken)
	if err != nil {
		return VerifySummary{}, err
	}

	var verifyEnv cfEnvelope[struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}]
	userTokenVerified := false
	statusCode, verifyErr := c.getJSON(ctx, token, "/user/tokens/verify", &verifyEnv)
	if verifyErr == nil && verifyEnv.Success && (verifyEnv.Result.Status == "" || verifyEnv.Result.Status == "active") {
		userTokenVerified = true
	} else if statusCode == http.StatusUnauthorized {
		return VerifySummary{}, ErrInvalidToken
	}

	var zonesEnv cfEnvelope[[]cfZone]
	zStatus, zErr := c.getJSON(ctx, token, "/zones?per_page=5", &zonesEnv)
	if zStatus == http.StatusUnauthorized {
		return VerifySummary{}, ErrInvalidToken
	}

	var acctEnv cfEnvelope[[]cfAccount]
	aStatus, aErr := c.getJSON(ctx, token, "/accounts?per_page=20", &acctEnv)
	if aStatus == http.StatusUnauthorized {
		return VerifySummary{}, ErrInvalidToken
	}

	// Account-owned tokens fail /user/tokens/verify with 400/403, so accept if either /zones or /accounts succeeded!
	if !userTokenVerified && (zErr != nil || !zonesEnv.Success) && (aErr != nil || !acctEnv.Success) {
		if errors.Is(verifyErr, ErrUpstreamUnavail) || errors.Is(zErr, ErrUpstreamUnavail) {
			return VerifySummary{}, ErrUpstreamUnavail
		}
		return VerifySummary{}, ErrInvalidToken
	}

	var summary VerifySummary
	seenAccounts := make(map[string]struct{})
	if aErr == nil && acctEnv.Success {
		for _, acc := range acctEnv.Result {
			name := strings.TrimSpace(acc.Name)
			if name != "" {
				if _, ok := seenAccounts[name]; !ok {
					seenAccounts[name] = struct{}{}
					summary.AccountNames = append(summary.AccountNames, name)
				}
			}
		}
	}

	if zErr == nil && zonesEnv.Success {
		summary.Scopes = append(summary.Scopes, "zones")
		if zonesEnv.ResultInfo != nil && zonesEnv.ResultInfo.TotalCount > 0 {
			summary.ZonesCount = zonesEnv.ResultInfo.TotalCount
		} else {
			summary.ZonesCount = len(zonesEnv.Result)
		}
		for _, z := range zonesEnv.Result {
			name := strings.TrimSpace(z.Account.Name)
			if name != "" {
				if _, ok := seenAccounts[name]; !ok {
					seenAccounts[name] = struct{}{}
					summary.AccountNames = append(summary.AccountNames, name)
				}
			}
		}
	}
	return summary, nil
}

func (c *HTTPCloudflareClient) FetchSnapshot(ctx context.Context, rawToken string) (Snapshot, error) {
	token, err := ValidateTokenFormat(rawToken)
	if err != nil {
		return Snapshot{}, err
	}

	snap := Snapshot{
		Registrar: make(map[string]RegistrarDomainInfo),
	}
	scopeSet := make(map[string]struct{})
	addScope := func(s string) { scopeSet[s] = struct{}{} }

	accountNamesByID := make(map[string]string)
	var acctEnv cfEnvelope[[]cfAccount]
	if _, aErr := c.getJSON(ctx, token, "/accounts?per_page=50", &acctEnv); aErr == nil && acctEnv.Success {
		for _, a := range acctEnv.Result {
			if a.ID != "" {
				accountNamesByID[a.ID] = strings.TrimSpace(a.Name)
			}
		}
	} else if errors.Is(aErr, ErrInvalidToken) {
		return Snapshot{}, ErrInvalidToken
	}

	// 1. Paginate Zones
	var allZones []cfZone
	for page := 1; page <= 10; page++ {
		var zEnv cfEnvelope[[]cfZone]
		_, zErr := c.getJSON(ctx, token, fmt.Sprintf("/zones?per_page=50&page=%d", page), &zEnv)
		if zErr != nil {
			if page == 1 {
				if errors.Is(zErr, ErrInvalidToken) || errors.Is(zErr, ErrUpstreamUnavail) {
					return Snapshot{}, zErr
				}
				return Snapshot{}, fmt.Errorf("fetch cloudflare zones: %w", zErr)
			}
			break
		}
		if !zEnv.Success {
			break
		}
		addScope("zones")
		allZones = append(allZones, zEnv.Result...)
		for _, z := range zEnv.Result {
			if z.Account.ID != "" && z.Account.Name != "" {
				accountNamesByID[z.Account.ID] = strings.TrimSpace(z.Account.Name)
			}
		}
		totalPages := 1
		if zEnv.ResultInfo != nil && zEnv.ResultInfo.TotalPages > 0 {
			totalPages = zEnv.ResultInfo.TotalPages
		}
		if page >= totalPages || len(zEnv.Result) == 0 {
			break
		}
	}

	for _, name := range accountNamesByID {
		if name != "" && !slices.Contains(snap.AccountNames, name) {
			snap.AccountNames = append(snap.AccountNames, name)
		}
	}
	slices.Sort(snap.AccountNames)

	// 2. Account-scoped discovery: Registrar, Zero Trust Tunnels, Cloudflare Pages
	for accountID := range accountNamesByID {
		// 2a. Cloudflare Registrar (best-effort; beta/optional permission)
		var regEnv cfEnvelope[[]struct {
			Name      string `json:"name"`
			ExpiresAt string `json:"expires_at"`
			AutoRenew bool   `json:"auto_renew"`
			Privacy   bool   `json:"privacy"`
			Locked    bool   `json:"locked"`
		}]
		if _, rErr := c.getJSON(ctx, token, "/accounts/"+url.PathEscape(accountID)+"/registrar/domains", &regEnv); rErr == nil && regEnv.Success {
			addScope("registrar")
			for _, dom := range regEnv.Result {
				cleanName := strings.ToLower(strings.TrimSpace(dom.Name))
				if cleanName == "" {
					continue
				}
				exp := ""
				if parsed, pErr := time.Parse(time.RFC3339, strings.TrimSpace(dom.ExpiresAt)); pErr == nil {
					exp = parsed.Format("2006-01-02")
				} else if len(dom.ExpiresAt) >= 10 {
					exp = dom.ExpiresAt[:10]
				}
				snap.Registrar[cleanName] = RegistrarDomainInfo{
					Name:      cleanName,
					ExpiresAt: exp,
					AutoRenew: dom.AutoRenew,
					Privacy:   dom.Privacy,
					Locked:    dom.Locked,
				}
			}
		}

		// 2b. Cloudflare Zero Trust Tunnels + Ingress Hostnames
		var tunEnv cfEnvelope[[]struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		}]
		if _, tErr := c.getJSON(ctx, token, "/accounts/"+url.PathEscape(accountID)+"/cfd_tunnel?is_deleted=false&per_page=50", &tunEnv); tErr == nil && tunEnv.Success {
			addScope("tunnels")
			for idx, tun := range tunEnv.Result {
				if idx >= 25 {
					break
				}
				var cfgEnv cfEnvelope[struct {
					Config struct {
						Ingress []struct {
							Hostname string `json:"hostname"`
							Service  string `json:"service"`
						} `json:"ingress"`
					} `json:"config"`
				}]
				matchedAny := false
				if _, cErr := c.getJSON(ctx, token, "/accounts/"+url.PathEscape(accountID)+"/cfd_tunnel/"+url.PathEscape(tun.ID)+"/configurations", &cfgEnv); cErr == nil && cfgEnv.Success {
					for _, rule := range cfgEnv.Result.Config.Ingress {
						host := strings.ToLower(strings.TrimSpace(rule.Hostname))
						if host == "" {
							continue
						}
						matchedAny = true
						snap.Tunnels = append(snap.Tunnels, SyncedTunnelRoute{
							ID:       tun.ID,
							Name:     tun.Name,
							Status:   tun.Status,
							Hostname: host,
							Service:  strings.TrimSpace(rule.Service),
						})
					}
				}
				if !matchedAny {
					snap.Tunnels = append(snap.Tunnels, SyncedTunnelRoute{
						ID:     tun.ID,
						Name:   tun.Name,
						Status: tun.Status,
					})
				}
			}
		}

		// 2c. Cloudflare Pages Projects
		var pagesEnv cfEnvelope[[]struct {
			Name      string   `json:"name"`
			Subdomain string   `json:"subdomain"`
			Domains   []string `json:"domains"`
		}]
		if _, pErr := c.getJSON(ctx, token, "/accounts/"+url.PathEscape(accountID)+"/pages/projects", &pagesEnv); pErr == nil && pagesEnv.Success {
			addScope("pages")
			for _, proj := range pagesEnv.Result {
				var customDomains []string
				for _, d := range proj.Domains {
					cleanD := strings.ToLower(strings.TrimSpace(d))
					if cleanD != "" && !strings.HasSuffix(cleanD, ".pages.dev") {
						customDomains = append(customDomains, cleanD)
					}
				}
				snap.Pages = append(snap.Pages, SyncedPagesProject{
					Name:      proj.Name,
					Subdomain: proj.Subdomain,
					Domains:   customDomains,
				})
			}
		}
	}

	// 3. Per-Zone DNS Records & Workers Routes
	allowedTypes := map[string]bool{
		"A": true, "AAAA": true, "CNAME": true, "MX": true,
		"TXT": true, "SRV": true, "CAA": true, "HTTPS": true, "NS": true,
	}

	for _, z := range allZones {
		zs := ZoneSnapshot{
			ZoneID:      z.ID,
			Name:        strings.ToLower(strings.TrimSpace(z.Name)),
			Status:      strings.ToLower(strings.TrimSpace(z.Status)),
			Paused:      z.Paused,
			PlanName:    strings.TrimSpace(z.Plan.Name),
			AccountID:   z.Account.ID,
			AccountName: strings.TrimSpace(z.Account.Name),
		}
		for _, ns := range z.NameServers {
			cleanNS := strings.Trim(strings.ToLower(strings.TrimSpace(ns)), ".")
			if cleanNS != "" {
				zs.NameServers = append(zs.NameServers, cleanNS)
			}
		}

		var dnsEnv cfEnvelope[[]struct {
			ID      string `json:"id"`
			Type    string `json:"type"`
			Name    string `json:"name"`
			Content string `json:"content"`
			Proxied bool   `json:"proxied"`
			TTL     int    `json:"ttl"`
		}]
		if _, dErr := c.getJSON(ctx, token, "/zones/"+url.PathEscape(z.ID)+"/dns_records?per_page=100", &dnsEnv); dErr == nil && dnsEnv.Success {
			addScope("dns")
			for _, rec := range dnsEnv.Result {
				rtype := strings.ToUpper(strings.TrimSpace(rec.Type))
				if !allowedTypes[rtype] {
					continue
				}
				content := strings.TrimSpace(rec.Content)
				if len(content) > 240 {
					content = content[:237] + "..."
				}
				zs.Records = append(zs.Records, SyncedDNSRecord{
					ID:      rec.ID,
					Type:    rtype,
					Name:    strings.ToLower(strings.TrimSpace(rec.Name)),
					Content: content,
					Proxied: rec.Proxied,
					TTL:     rec.TTL,
				})
				if len(zs.Records) >= 100 {
					break
				}
			}
		}

		var wrkEnv cfEnvelope[[]struct {
			Pattern string `json:"pattern"`
			Script  string `json:"script"`
		}]
		if _, wErr := c.getJSON(ctx, token, "/zones/"+url.PathEscape(z.ID)+"/workers/routes", &wrkEnv); wErr == nil && wrkEnv.Success {
			addScope("workers")
			for _, wr := range wrkEnv.Result {
				pat := strings.TrimSpace(wr.Pattern)
				if pat != "" && wr.Script != "" {
					zs.WorkerRoutes = append(zs.WorkerRoutes, pat+" → "+wr.Script)
				}
			}
		}

		snap.Zones = append(snap.Zones, zs)
	}

	for sc := range scopeSet {
		snap.Scopes = append(snap.Scopes, sc)
	}
	slices.Sort(snap.Scopes)
	return snap, nil
}
