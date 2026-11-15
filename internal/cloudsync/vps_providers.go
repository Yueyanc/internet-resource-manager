package cloudsync

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ============================================================================
// 1. Hetzner Cloud (Read-Only Project Token)
// ============================================================================

type HetznerAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *HetznerAdapter) ProviderKey() string { return "hetzner" }

func (a *HetznerAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.hetzner.cloud/v1"
}

func (a *HetznerAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *HetznerAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	tok := creds.Get("apiToken")
	if len(tok) < 16 || strings.ContainsAny(tok, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"apiToken": tok}, MaskSecret(tok), nil
}

func (a *HetznerAdapter) getJSON(ctx context.Context, token, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL()+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("Hetzner Cloud API (%s) 返回状态 %d", path, resp.StatusCode)
	}
	return json.Unmarshal(body, out)
}

func (a *HetznerAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	tok := clean.Get("apiToken")

	var srvPayload struct {
		Servers []struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			Status    string `json:"status"`
			PublicNet struct {
				IPv4 struct {
					IP string `json:"ip"`
				} `json:"ipv4"`
				IPv6 struct {
					IP string `json:"ip"`
				} `json:"ipv6"`
			} `json:"public_net"`
			PrivateNet []struct {
				IP string `json:"ip"`
			} `json:"private_net"`
			ServerType struct {
				Name         string  `json:"name"`
				Description  string  `json:"description"`
				Cores        int64   `json:"cores"`
				Memory       float64 `json:"memory"`
				Disk         int64   `json:"disk"`
				Architecture string  `json:"architecture"`
			} `json:"server_type"`
			Datacenter struct {
				Name     string `json:"name"`
				Location struct {
					Name    string `json:"name"`
					Country string `json:"country"`
					City    string `json:"city"`
				} `json:"location"`
			} `json:"datacenter"`
			Image *struct {
				Description string `json:"description"`
				Name        string `json:"name"`
				OSFlavor    string `json:"os_flavor"`
			} `json:"image"`
			IngoingTraffic  int64 `json:"ingoing_traffic"`
			OutgoingTraffic int64 `json:"outgoing_traffic"`
			IncludedTraffic int64 `json:"included_traffic"`
		} `json:"servers"`
	}
	if err := a.getJSON(ctx, tok, "/servers?per_page=50", &srvPayload); err != nil {
		return UnifiedSnapshot{}, err
	}

	snap := UnifiedSnapshot{
		Provider: "hetzner",
		Scopes:   []string{"servers:read", "ips:read"},
	}

	for _, s := range srvPayload.Servers {
		extID := fmt.Sprintf("hz:%d", s.ID)
		region := normalizeRegionCode(s.Datacenter.Location.Country)
		if s.Datacenter.Location.Country == "" {
			region = normalizeRegionCode(s.Datacenter.Name)
		}
		arch := "amd64"
		if strings.Contains(strings.ToLower(s.ServerType.Architecture), "arm") {
			arch = "arm64"
		}
		osName := ""
		if s.Image != nil {
			osName = strings.TrimSpace(s.Image.Description)
			if osName == "" {
				osName = strings.TrimSpace(s.Image.Name)
			}
		}
		status := "active"
		if s.Status == "off" || s.Status == "stopping" {
			status = "standby"
		}

		v4 := strings.TrimSpace(s.PublicNet.IPv4.IP)
		v6 := strings.TrimSpace(s.PublicNet.IPv6.IP)
		if pfx, perr := netip.ParsePrefix(v6); perr == nil {
			// Hetzner returns /64 subnet like 2a01:4f8:..::/64; canonical ::1 host
			v6 = strings.TrimSuffix(pfx.Addr().String(), "::") + "::1"
			if _, aerr := netip.ParseAddr(v6); aerr != nil {
				v6 = pfx.Addr().String()
			}
		}
		var privIP string
		if len(s.PrivateNet) > 0 {
			privIP = strings.TrimSpace(s.PrivateNet[0].IP)
		}

		var trafficGB int64
		if s.IncludedTraffic > 0 {
			trafficGB = s.IncludedTraffic / (1024 * 1024 * 1024)
		}

		snap.Servers = append(snap.Servers, SyncedServer{
			ExternalID:      extID,
			PresetKey:       "hetzner",
			Name:            s.Name,
			Hostname:        s.Name,
			ProviderName:    "Hetzner",
			Kind:            "vps",
			Status:          status,
			Region:          region,
			Datacenter:      s.Datacenter.Name,
			OS:              osName,
			Arch:            arch,
			CPUCores:        s.ServerType.Cores,
			MemoryMB:        int64(math.Round(s.ServerType.Memory * 1024)),
			DiskGB:          s.ServerType.Disk,
			DiskType:        "nvme",
			TrafficGB:       trafficGB,
			TrafficRule:     "out",
			TrafficResetDay: 1,
			IPv4:            v4,
			IPv6:            v6,
			PrivateIP:       privIP,
			SSHPort:         22,
			ConsoleURL:      "https://console.hetzner.cloud/",
			Tags:            []string{"Hetzner", strings.ToUpper(s.ServerType.Name)},
			Meta: ServerProviderMeta{
				Provider:          "hetzner",
				ExternalID:        strconv.FormatInt(s.ID, 10),
				Plan:              s.ServerType.Name,
				TrafficUsedBytes:  s.OutgoingTraffic,
				TrafficTotalBytes: s.IncludedTraffic,
			},
		})

		if v4 != "" {
			snap.IPs = append(snap.IPs, SyncedIP{
				ExternalID:     fmt.Sprintf("hz-ip4:%d", s.ID),
				PresetKey:      "hetzner",
				Address:        v4,
				NetworkScope:   "overseas_exit",
				Category:       "cloud_vps",
				ProviderName:   "Hetzner",
				Label:          s.Name,
				Region:         region,
				City:           s.Datacenter.Location.City,
				ASNType:        "hosting",
				OriginType:     "native",
				Role:           "primary",
				Status:         "active",
				RiskLevel:      "unassessed",
				HostExternalID: extID,
				HostLabel:      s.Name,
				ConsoleURL:     "https://console.hetzner.cloud/",
				Tags:           []string{"Hetzner"},
			})
		}
	}

	var floatPayload struct {
		FloatingIPs []struct {
			ID           int64  `json:"id"`
			IP           string `json:"ip"`
			Name         string `json:"name"`
			Description  string `json:"description"`
			Server       *int64 `json:"server"`
			HomeLocation struct {
				Country string `json:"country"`
				City    string `json:"city"`
			} `json:"home_location"`
		} `json:"floating_ips"`
	}
	if err := a.getJSON(ctx, tok, "/floating_ips?per_page=50", &floatPayload); err == nil {
		for _, fip := range floatPayload.FloatingIPs {
			addr := strings.TrimSpace(fip.IP)
			if pfx, perr := netip.ParsePrefix(addr); perr == nil {
				addr = pfx.Addr().String()
			}
			if addr == "" {
				continue
			}
			var hostExt string
			if fip.Server != nil {
				hostExt = fmt.Sprintf("hz:%d", *fip.Server)
			}
			label := strings.TrimSpace(fip.Name)
			if label == "" {
				label = strings.TrimSpace(fip.Description)
			}
			snap.IPs = append(snap.IPs, SyncedIP{
				ExternalID:     fmt.Sprintf("hz-fip:%d", fip.ID),
				PresetKey:      "hetzner",
				Address:        addr,
				NetworkScope:   "overseas_exit",
				Category:       "dedicated_ip",
				ProviderName:   "Hetzner",
				Label:          label,
				Region:         normalizeRegionCode(fip.HomeLocation.Country),
				City:           fip.HomeLocation.City,
				ASNType:        "hosting",
				OriginType:     "native",
				Role:           "dedicated",
				Status:         "active",
				RiskLevel:      "unassessed",
				HostExternalID: hostExt,
				ConsoleURL:     "https://console.hetzner.cloud/",
				Tags:           []string{"Hetzner", "Floating IP"},
			})
		}
	}

	return snap, nil
}

// ============================================================================
// 2. DigitalOcean (Scoped Read-Only Personal Access Token)
// ============================================================================

type DigitalOceanAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *DigitalOceanAdapter) ProviderKey() string { return "digitalocean" }

func (a *DigitalOceanAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.digitalocean.com/v2"
}

func (a *DigitalOceanAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *DigitalOceanAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	tok := creds.Get("apiToken")
	if len(tok) < 16 || strings.ContainsAny(tok, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"apiToken": tok}, MaskSecret(tok), nil
}

func (a *DigitalOceanAdapter) getJSON(ctx context.Context, token, path string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL()+path, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
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
		return resp.StatusCode, fmt.Errorf("DigitalOcean API (%s) 返回状态 %d", path, resp.StatusCode)
	}
	return resp.StatusCode, json.Unmarshal(body, out)
}

func (a *DigitalOceanAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	tok := clean.Get("apiToken")

	snap := UnifiedSnapshot{Provider: "digitalocean"}
	var anyPermitted bool

	var acctPayload struct {
		Account struct {
			Email string `json:"email"`
			Team  *struct {
				Name string `json:"name"`
			} `json:"team"`
		} `json:"account"`
	}
	if code, aerr := a.getJSON(ctx, tok, "/account", &acctPayload); aerr == nil {
		anyPermitted = true
		if acctPayload.Account.Team != nil && acctPayload.Account.Team.Name != "" {
			snap.AccountNames = []string{acctPayload.Account.Team.Name}
		} else if acctPayload.Account.Email != "" {
			snap.AccountNames = []string{acctPayload.Account.Email}
		}
	} else if code == http.StatusUnauthorized {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	var dropPayload struct {
		Droplets []struct {
			ID       int64    `json:"id"`
			Name     string   `json:"name"`
			Memory   int64    `json:"memory"`
			Vcpus    int64    `json:"vcpus"`
			Disk     int64    `json:"disk"`
			Status   string   `json:"status"`
			SizeSlug string   `json:"size_slug"`
			Tags     []string `json:"tags"`
			Image    struct {
				Distribution string `json:"distribution"`
				Name         string `json:"name"`
			} `json:"image"`
			Region struct {
				Slug string `json:"slug"`
				Name string `json:"name"`
			} `json:"region"`
			Size struct {
				Transfer float64 `json:"transfer"`
			} `json:"size"`
			Networks struct {
				V4 []struct {
					IPAddress string `json:"ip_address"`
					Type      string `json:"type"`
				} `json:"v4"`
				V6 []struct {
					IPAddress string `json:"ip_address"`
					Type      string `json:"type"`
				} `json:"v6"`
			} `json:"networks"`
		} `json:"droplets"`
	}
	if code, derr := a.getJSON(ctx, tok, "/droplets?per_page=100", &dropPayload); derr == nil {
		anyPermitted = true
		snap.Scopes = append(snap.Scopes, "droplet:read")
		for _, d := range dropPayload.Droplets {
			extID := fmt.Sprintf("do:%d", d.ID)
			var pubV4, privV4, pubV6 string
			for _, n := range d.Networks.V4 {
				if n.Type == "public" && pubV4 == "" {
					pubV4 = n.IPAddress
				} else if n.Type == "private" && privV4 == "" {
					privV4 = n.IPAddress
				}
			}
			for _, n := range d.Networks.V6 {
				if n.Type == "public" && pubV6 == "" {
					pubV6 = n.IPAddress
				}
			}
			region := normalizeRegionCode(d.Region.Slug)
			status := "active"
			if d.Status == "off" {
				status = "standby"
			}
			osLabel := strings.TrimSpace(d.Image.Distribution + " " + d.Image.Name)
			trafficGB := int64(math.Round(d.Size.Transfer * 1024))

			snap.Servers = append(snap.Servers, SyncedServer{
				ExternalID:      extID,
				PresetKey:       "digitalocean",
				Name:            d.Name,
				Hostname:        d.Name,
				ProviderName:    "DigitalOcean",
				Kind:            "vps",
				Status:          status,
				Region:          region,
				Datacenter:      d.Region.Slug,
				OS:              osLabel,
				Arch:            "amd64",
				CPUCores:        d.Vcpus,
				MemoryMB:        d.Memory,
				DiskGB:          d.Disk,
				DiskType:        "ssd",
				TrafficGB:       trafficGB,
				TrafficRule:     "out",
				TrafficResetDay: 1,
				IPv4:            pubV4,
				IPv6:            pubV6,
				PrivateIP:       privV4,
				SSHPort:         22,
				ConsoleURL:      fmt.Sprintf("https://cloud.digitalocean.com/droplets/%d", d.ID),
				Tags:            append([]string{"DigitalOcean"}, d.Tags...),
				Meta: ServerProviderMeta{
					Provider:   "digitalocean",
					ExternalID: strconv.FormatInt(d.ID, 10),
					Plan:       d.SizeSlug,
				},
			})
			if pubV4 != "" {
				snap.IPs = append(snap.IPs, SyncedIP{
					ExternalID:     fmt.Sprintf("do-ip4:%d", d.ID),
					PresetKey:      "digitalocean",
					Address:        pubV4,
					NetworkScope:   "overseas_exit",
					Category:       "cloud_vps",
					ProviderName:   "DigitalOcean",
					Label:          d.Name,
					Region:         region,
					City:           d.Region.Name,
					ASNType:        "hosting",
					OriginType:     "native",
					Role:           "primary",
					Status:         "active",
					RiskLevel:      "unassessed",
					HostExternalID: extID,
					HostLabel:      d.Name,
					ConsoleURL:     fmt.Sprintf("https://cloud.digitalocean.com/droplets/%d", d.ID),
					Tags:           []string{"DigitalOcean"},
				})
			}
		}
	} else if code == http.StatusUnauthorized {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	var domPayload struct {
		Domains []struct {
			Name string `json:"name"`
			TTL  int    `json:"ttl"`
		} `json:"domains"`
	}
	if code, zerr := a.getJSON(ctx, tok, "/domains?per_page=100", &domPayload); zerr == nil {
		anyPermitted = true
		snap.Scopes = append(snap.Scopes, "domain:read")
		for _, dom := range domPayload.Domains {
			var recPayload struct {
				DomainRecords []struct {
					ID   int64  `json:"id"`
					Type string `json:"type"`
					Name string `json:"name"`
					Data string `json:"data"`
					TTL  int    `json:"ttl"`
				} `json:"domain_records"`
			}
			var recs []SyncedDNSRecord
			if _, rerr := a.getJSON(ctx, tok, "/domains/"+url.PathEscape(dom.Name)+"/records?per_page=100", &recPayload); rerr == nil {
				for _, r := range recPayload.DomainRecords {
					if r.Type == "SOA" || r.Type == "NS" {
						continue
					}
					fqdn := dom.Name
					if r.Name != "" && r.Name != "@" {
						fqdn = r.Name + "." + dom.Name
					}
					recs = append(recs, SyncedDNSRecord{
						ID:      strconv.FormatInt(r.ID, 10),
						Type:    r.Type,
						Name:    fqdn,
						Content: strings.Trim(r.Data, "."),
						TTL:     r.TTL,
					})
				}
			}
			snap.Zones = append(snap.Zones, ZoneSnapshot{
				ZoneID:           "do:" + dom.Name,
				Name:             dom.Name,
				Status:           "active",
				DNSProviderName:  "DigitalOcean DNS",
				ConsoleURL:       "https://cloud.digitalocean.com/networking/domains/" + dom.Name,
				DefaultPresetKey: "digitalocean_dns",
				Records:          recs,
			})
		}
	} else if code == http.StatusUnauthorized {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	if !anyPermitted {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}
	return snap, nil
}

// ============================================================================
// 3. BandwagonHost KiwiVM (VEID + API Key)
// ============================================================================

type BandwagonAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *BandwagonAdapter) ProviderKey() string { return "bandwagon" }

func (a *BandwagonAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.64clouds.com/v1"
}

func (a *BandwagonAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *BandwagonAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	veid := creds.Get("veid")
	apiKey := creds.Get("apiKey")
	if veid == "" || len(apiKey) < 8 || strings.ContainsAny(veid+apiKey, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"veid": veid, "apiKey": apiKey}, "VEID:" + veid, nil
}

func (a *BandwagonAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	q := url.Values{}
	q.Set("veid", clean.Get("veid"))
	q.Set("api_key", clean.Get("apiKey"))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL()+"/getLiveServiceInfo?"+q.Encode(), nil)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return UnifiedSnapshot{}, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 4<<20)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return UnifiedSnapshot{}, fmt.Errorf("KiwiVM API 返回异常状态 %d", resp.StatusCode)
	}

	var info struct {
		Error                 int      `json:"error"`
		Message               string   `json:"message"`
		Hostname              string   `json:"hostname"`
		NodeLocation          string   `json:"node_location"`
		NodeDatacenter        string   `json:"node_datacenter"`
		Plan                  string   `json:"plan"`
		PlanMonthlyData       int64    `json:"plan_monthly_data"`
		DataCounter           int64    `json:"data_counter"`
		MonthlyDataMultiplier int64    `json:"monthly_data_multiplier"`
		DataNextReset         int64    `json:"data_next_reset"`
		PlanDisk              int64    `json:"plan_disk"`
		PlanRAM               int64    `json:"plan_ram"`
		OS                    string   `json:"os"`
		Email                 string   `json:"email"`
		IPAddresses           []string `json:"ip_addresses"`
		IPNullroutes          any      `json:"ip_nullroutes"`
		Suspended             bool     `json:"suspended"`
		VeStatus              string   `json:"ve_status"`
		SSHPort               int64    `json:"ssh_port"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return UnifiedSnapshot{}, fmt.Errorf("解析 KiwiVM 响应失败: %w", err)
	}
	if info.Error != 0 {
		if info.Error == 700005 || strings.Contains(strings.ToLower(info.Message), "auth") || strings.Contains(strings.ToLower(info.Message), "invalid") {
			return UnifiedSnapshot{}, ErrInvalidCredentials
		}
		return UnifiedSnapshot{}, fmt.Errorf("KiwiVM 返回错误 (%d): %s", info.Error, info.Message)
	}

	veid := clean.Get("veid")
	extID := "bwh:" + veid
	mult := info.MonthlyDataMultiplier
	if mult <= 0 {
		mult = 1
	}
	usedBytes := info.DataCounter * mult
	totalBytes := info.PlanMonthlyData * mult
	trafficGB := totalBytes / (1024 * 1024 * 1024)

	var resetDay int64 = 1
	var resetAtISO string
	if info.DataNextReset > 0 {
		rt := time.Unix(info.DataNextReset, 0).UTC()
		resetDay = int64(rt.Day())
		resetAtISO = rt.Format(time.RFC3339)
	}

	var v4, v6 string
	for _, rawIP := range info.IPAddresses {
		if addr, perr := netip.ParseAddr(strings.TrimSpace(rawIP)); perr == nil {
			if addr.Is4() && v4 == "" {
				v4 = addr.String()
			} else if addr.Is6() && v6 == "" {
				v6 = addr.String()
			}
		}
	}

	region := normalizeRegionCode(info.NodeLocation + " " + info.NodeDatacenter)
	host := strings.TrimSpace(info.Hostname)
	if host == "" {
		host = "BWH-" + veid
	}
	status := "active"
	if info.Suspended || strings.EqualFold(info.VeStatus, "Stopped") {
		status = "standby"
	}
	sshPort := info.SSHPort
	if sshPort <= 0 || sshPort > 65535 {
		sshPort = 22
	}

	nullrouted := info.Suspended
	switch nr := info.IPNullroutes.(type) {
	case []any:
		if len(nr) > 0 {
			nullrouted = true
		}
	case map[string]any:
		if len(nr) > 0 {
			nullrouted = true
		}
	}

	snap := UnifiedSnapshot{
		Provider: "bandwagon",
		Scopes:   []string{"getLiveServiceInfo"},
	}
	if info.Email != "" {
		snap.AccountNames = []string{info.Email}
	}

	snap.Servers = append(snap.Servers, SyncedServer{
		ExternalID:      extID,
		PresetKey:       "bandwagon",
		Name:            host,
		Hostname:        host,
		ProviderName:    "搬瓦工 BandwagonHost",
		Kind:            "vps",
		Status:          status,
		Region:          region,
		Datacenter:      info.NodeDatacenter,
		OS:              info.OS,
		Arch:            "amd64",
		MemoryMB:        info.PlanRAM / (1024 * 1024),
		DiskGB:          info.PlanDisk / (1024 * 1024 * 1024),
		DiskType:        "ssd",
		TrafficGB:       trafficGB,
		TrafficRule:     "both",
		TrafficResetDay: resetDay,
		IPv4:            v4,
		IPv6:            v6,
		SSHPort:         sshPort,
		ConsoleURL:      "https://kiwivm.64clouds.com/",
		Tags:            []string{"BandwagonHost", info.Plan},
		Meta: ServerProviderMeta{
			Provider:          "bandwagon",
			ExternalID:        veid,
			Plan:              info.Plan,
			TrafficUsedBytes:  usedBytes,
			TrafficTotalBytes: totalBytes,
			TrafficResetAt:    resetAtISO,
			Suspended:         info.Suspended,
		},
	})

	if v4 != "" {
		risk := "clean"
		note := ""
		if nullrouted {
			risk = "high_risk"
			note = "KiwiVM 报告该 IP 处于封禁/黑洞或停机状态"
		}
		snap.IPs = append(snap.IPs, SyncedIP{
			ExternalID:     "bwh-ip4:" + veid,
			PresetKey:      "bandwagon",
			Address:        v4,
			NetworkScope:   "overseas_exit",
			Category:       "cloud_vps",
			ProviderName:   "搬瓦工 BandwagonHost",
			Label:          host,
			Region:         region,
			City:           info.NodeLocation,
			ASNType:        "hosting",
			OriginType:     "native",
			Role:           "primary",
			Status:         "active",
			RiskLevel:      risk,
			PurityNote:     note,
			HostExternalID: extID,
			HostLabel:      host,
			ConsoleURL:     "https://kiwivm.64clouds.com/",
			Tags:           []string{"BandwagonHost"},
		})
	}

	return snap, nil
}
