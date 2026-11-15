package cloudsync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
)

type TailscaleAdapter struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (a *TailscaleAdapter) ProviderKey() string { return "tailscale" }

func (a *TailscaleAdapter) baseURL() string {
	if strings.TrimSpace(a.BaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	}
	return "https://api.tailscale.com"
}

func (a *TailscaleAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *TailscaleAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	clientID := creds.Get("clientId")
	secret := creds.Get("clientSecret")
	if secret == "" {
		secret = creds.Get("apiToken")
	}
	if len(secret) < 8 || strings.ContainsAny(secret, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	out := Credentials{"clientSecret": secret}
	if clientID != "" {
		out["clientId"] = clientID
		return out, MaskSecret(clientID), nil
	}
	return out, MaskSecret(secret), nil
}

func (a *TailscaleAdapter) obtainBearer(ctx context.Context, creds Credentials) (string, []string, error) {
	clientID := creds.Get("clientId")
	secret := creds.Get("clientSecret")
	if clientID == "" {
		return secret, []string{"api_key"}, nil
	}

	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", secret)
	form.Set("grant_type", "client_credentials")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL()+"/api/v2/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 1<<20)
	if err != nil {
		return "", nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusBadRequest {
		return "", nil, ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return "", nil, fmt.Errorf("Tailscale OAuth 返回异常状态 %d", resp.StatusCode)
	}

	var tokResp struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tokResp); err != nil || strings.TrimSpace(tokResp.AccessToken) == "" {
		return "", nil, ErrInvalidCredentials
	}
	scopes := strings.Fields(tokResp.Scope)
	if len(scopes) == 0 {
		scopes = []string{"devices:core:read"}
	}
	return tokResp.AccessToken, scopes, nil
}

func (a *TailscaleAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	cleanCreds, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	bearer, scopes, err := a.obtainBearer(ctx, cleanCreds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL()+"/api/v2/tailnet/-/devices", nil)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "application/json")

	resp, err := a.client().Do(req)
	if err != nil {
		return UnifiedSnapshot{}, fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}
	if resp.StatusCode >= 400 {
		return UnifiedSnapshot{}, fmt.Errorf("Tailscale API 返回状态 %d", resp.StatusCode)
	}

	var payload struct {
		Devices []struct {
			ID            string   `json:"id"`
			NodeID        string   `json:"nodeId"`
			Name          string   `json:"name"`
			Hostname      string   `json:"hostname"`
			OS            string   `json:"os"`
			ClientVersion string   `json:"clientVersion"`
			Addresses     []string `json:"addresses"`
			LastSeen      string   `json:"lastSeen"`
			Tags          []string `json:"tags"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return UnifiedSnapshot{}, fmt.Errorf("解析 Tailscale 设备列表失败: %w", err)
	}

	snap := UnifiedSnapshot{
		Provider: "tailscale",
		Scopes:   scopes,
	}

	var tailnetSuffix string
	for _, dev := range payload.Devices {
		extID := strings.TrimSpace(dev.NodeID)
		if extID == "" {
			extID = strings.TrimSpace(dev.ID)
		}
		fqdn := strings.Trim(strings.TrimSpace(dev.Name), ".")
		if tailnetSuffix == "" && strings.Contains(fqdn, ".") {
			parts := strings.SplitN(fqdn, ".", 2)
			if len(parts) == 2 && parts[1] != "" {
				tailnetSuffix = parts[1]
			}
		}

		host := strings.TrimSpace(dev.Hostname)
		if host == "" && fqdn != "" {
			host = strings.Split(fqdn, ".")[0]
		}
		if host == "" {
			host = "tailscale-node"
		}

		var v4, v6 string
		for _, rawAddr := range dev.Addresses {
			if parsed, perr := netip.ParseAddr(strings.TrimSpace(rawAddr)); perr == nil {
				if parsed.Is4() && v4 == "" {
					v4 = parsed.String()
				} else if parsed.Is6() && v6 == "" {
					v6 = parsed.String()
				}
			}
		}

		arch := "amd64"
		lowerOS := strings.ToLower(dev.OS)
		if strings.Contains(lowerOS, "ios") || strings.Contains(lowerOS, "android") || strings.Contains(lowerOS, "macos") || strings.Contains(lowerOS, "darwin") {
			arch = "arm64"
		}

		presetKey := ""
		kind := "homelab"
		switch {
		case strings.Contains(lowerOS, "macos") || strings.Contains(lowerOS, "darwin"):
			presetKey = "mac_mini"
		case strings.Contains(lowerOS, "synology"):
			presetKey = "synology"
			kind = "nas"
		case strings.Contains(lowerOS, "unraid"):
			presetKey = "unraid"
			kind = "nas"
		case strings.Contains(lowerOS, "linux"):
			kind = "vps"
		}

		tags := []string{"Tailscale"}
		for _, t := range dev.Tags {
			clean := strings.TrimPrefix(strings.TrimSpace(t), "tag:")
			if clean != "" && len(tags) < 10 {
				tags = append(tags, clean)
			}
		}

		srvHostname := fqdn
		if srvHostname == "" {
			srvHostname = host
		}

		snap.Servers = append(snap.Servers, SyncedServer{
			ExternalID:   "ts:" + extID,
			PresetKey:    presetKey,
			Name:         host,
			Hostname:     srvHostname,
			ProviderName: "Tailscale",
			Kind:         kind,
			Status:       "active",
			Region:       "US",
			OS:           dev.OS,
			Arch:         arch,
			TrafficRule:  "unlimited",
			PrivateIP:    v4,
			SSHPort:      22,
			ConsoleURL:   "https://login.tailscale.com/admin/machines",
			Tags:         tags,
			Meta: ServerProviderMeta{
				Provider:      "tailscale",
				ExternalID:    extID,
				LastSeenAt:    dev.LastSeen,
				ClientVersion: dev.ClientVersion,
			},
		})

		if v4 != "" {
			snap.IPs = append(snap.IPs, SyncedIP{
				ExternalID:     "ts-ip4:" + extID,
				PresetKey:      "tailscale",
				Address:        v4,
				NetworkScope:   "overlay_private",
				Category:       "overlay_mesh",
				ProviderName:   "Tailscale",
				Label:          host + " (Tailnet)",
				Region:         "US",
				ASNType:        "isp",
				OriginType:     "native",
				Role:           "overlay",
				Status:         "active",
				RiskLevel:      "clean",
				HostExternalID: "ts:" + extID,
				HostLabel:      host,
				ConsoleURL:     "https://login.tailscale.com/admin/machines",
				Tags:           []string{"Tailscale", "MagicDNS"},
			})
		}
	}

	if tailnetSuffix != "" {
		snap.AccountNames = []string{tailnetSuffix}
	}
	return snap, nil
}
