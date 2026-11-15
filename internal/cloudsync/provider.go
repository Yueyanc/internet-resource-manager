package cloudsync

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"
)

var (
	ErrInvalidCredentials  = errors.New("平台鉴权凭据无效或权限不足")
	ErrUnsupportedProvider = errors.New("不支持的云平台同步类型")
)

func IsAuthError(err error) bool {
	return errors.Is(err, ErrInvalidToken) || errors.Is(err, ErrInvalidCredentials)
}

type Credentials map[string]string

func (c Credentials) Get(key string) string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c[key])
}

type ProviderFieldSpec struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	LabelEn       string `json:"labelEn"`
	Placeholder   string `json:"placeholder"`
	PlaceholderEn string `json:"placeholderEn"`
	Secret        bool   `json:"secret"`
	Required      bool   `json:"required"`
	Help          string `json:"help,omitempty"`
	HelpEn        string `json:"helpEn,omitempty"`
}

type ProviderMetaSpec struct {
	Key                  string              `json:"key"`
	Name                 string              `json:"name"`
	NameEn               string              `json:"nameEn"`
	Subtitle             string              `json:"subtitle"`
	SubtitleEn           string              `json:"subtitleEn"`
	Color                string              `json:"color"`
	Targets              []string            `json:"targets"`
	ReadOnlyMode         string              `json:"readOnlyMode"`
	SafetyNote           string              `json:"safetyNote"`
	SafetyNoteEn         string              `json:"safetyNoteEn"`
	StepTitle            string              `json:"stepTitle"`
	StepTitleEn          string              `json:"stepTitleEn"`
	StepDescription      string              `json:"stepDescription"`
	StepDescriptionEn    string              `json:"stepDescriptionEn"`
	PrimaryActionLabel   string              `json:"primaryActionLabel"`
	PrimaryActionLabelEn string              `json:"primaryActionLabelEn"`
	PrimaryActionURL     string              `json:"primaryActionUrl"`
	SecondaryActionLabel string              `json:"secondaryActionLabel,omitempty"`
	SecondaryActionURL   string              `json:"secondaryActionUrl,omitempty"`
	RecommendedScopes    []string            `json:"recommendedScopes"`
	Fields               []ProviderFieldSpec `json:"fields"`
	MatchedPresets       []string            `json:"matchedPresets"`
}

type ServerProviderMeta struct {
	Provider          string `json:"provider,omitempty"`
	ExternalID        string `json:"externalId,omitempty"`
	Plan              string `json:"plan,omitempty"`
	TrafficUsedBytes  int64  `json:"trafficUsedBytes,omitempty"`
	TrafficTotalBytes int64  `json:"trafficTotalBytes,omitempty"`
	TrafficResetAt    string `json:"trafficResetAt,omitempty"`
	LastSeenAt        string `json:"lastSeenAt,omitempty"`
	ClientVersion     string `json:"clientVersion,omitempty"`
	Suspended         bool   `json:"suspended,omitempty"`
}

type SyncedServer struct {
	ExternalID      string
	PresetKey       string
	Name            string
	Hostname        string
	ProviderName    string
	Kind            string
	Status          string
	Region          string
	Datacenter      string
	OS              string
	Arch            string
	CPUCores        int64
	MemoryMB        int64
	DiskGB          int64
	DiskType        string
	BandwidthMbps   int64
	TrafficGB       int64
	TrafficRule     string
	TrafficResetDay int64
	IPv4            string
	IPv6            string
	PrivateIP       string
	SSHPort         int64
	ConsoleURL      string
	ExpireDate      string
	Tags            []string
	Meta            ServerProviderMeta
}

type SyncedIP struct {
	ExternalID     string
	PresetKey      string
	Address        string
	NetworkScope   string
	Category       string
	ProviderName   string
	Label          string
	Region         string
	City           string
	ASNType        string
	OriginType     string
	Role           string
	Status         string
	RiskLevel      string
	PurityNote     string
	HostExternalID string
	HostLabel      string
	ConsoleURL     string
	Tags           []string
}

type UnifiedSnapshot struct {
	Provider     string
	AccountNames []string
	Scopes       []string
	Zones        []ZoneSnapshot
	Registrar    map[string]RegistrarDomainInfo
	Tunnels      []SyncedTunnelRoute
	Pages        []SyncedPagesProject
	Servers      []SyncedServer
	IPs          []SyncedIP
}

type Adapter interface {
	ProviderKey() string
	ValidateCredentials(creds Credentials) (Credentials, string, error)
	Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error)
}

type Registry struct {
	adapters map[string]Adapter
	specs    []ProviderMetaSpec
}

func NewDefaultRegistry(cfClient CloudflareClient) *Registry {
	if cfClient == nil {
		cfClient = NewCloudflareClient()
	}
	httpClient := &http.Client{Timeout: 25 * time.Second}
	r := &Registry{
		adapters: make(map[string]Adapter),
		specs:    ProviderCatalog(),
	}
	r.Register(&cloudflareAdapter{client: cfClient})
	r.Register(&TailscaleAdapter{HTTPClient: httpClient})
	r.Register(&AliyunAdapter{HTTPClient: httpClient})
	r.Register(&TencentAdapter{HTTPClient: httpClient})
	r.Register(&HetznerAdapter{HTTPClient: httpClient})
	r.Register(&DigitalOceanAdapter{HTTPClient: httpClient})
	r.Register(&BandwagonAdapter{HTTPClient: httpClient})
	r.Register(&PorkbunAdapter{HTTPClient: httpClient})
	r.Register(&SpaceshipAdapter{HTTPClient: httpClient})
	r.Register(&VercelAdapter{HTTPClient: httpClient})
	return r
}

func (r *Registry) Register(a Adapter) {
	if a == nil {
		return
	}
	r.adapters[a.ProviderKey()] = a
}

func (r *Registry) Specs() []ProviderMetaSpec {
	return slices.Clone(r.specs)
}

func (r *Registry) Adapter(provider string) (Adapter, ProviderMetaSpec, error) {
	clean := strings.ToLower(strings.TrimSpace(provider))
	a, ok := r.adapters[clean]
	if !ok {
		return nil, ProviderMetaSpec{}, ErrUnsupportedProvider
	}
	for _, sp := range r.specs {
		if sp.Key == clean {
			return a, sp, nil
		}
	}
	return a, ProviderMetaSpec{Key: clean, Name: clean}, nil
}

type cloudflareAdapter struct {
	client CloudflareClient
}

func (a *cloudflareAdapter) ProviderKey() string { return "cloudflare" }

func (a *cloudflareAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	tok, err := ValidateTokenFormat(creds.Get("apiToken"))
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"apiToken": tok}, MaskSecret(tok), nil
}

func (a *cloudflareAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	tok := creds.Get("apiToken")
	ver, err := a.client.Verify(ctx, tok)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			return UnifiedSnapshot{}, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
		}
		return UnifiedSnapshot{}, err
	}
	snap, err := a.client.FetchSnapshot(ctx, tok)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			return UnifiedSnapshot{}, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
		}
		return UnifiedSnapshot{}, err
	}
	accountNames := snap.AccountNames
	if len(accountNames) == 0 {
		accountNames = ver.AccountNames
	}
	scopes := snap.Scopes
	if len(scopes) == 0 {
		scopes = ver.Scopes
	}
	return UnifiedSnapshot{
		Provider:     "cloudflare",
		AccountNames: accountNames,
		Scopes:       scopes,
		Zones:        snap.Zones,
		Registrar:    snap.Registrar,
		Tunnels:      snap.Tunnels,
		Pages:        snap.Pages,
	}, nil
}

func readBoundedBody(r io.Reader, maxBytes int64) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, maxBytes))
}

func normalizeRegionCode(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	switch {
	case s == "":
		return "US"
	case strings.HasPrefix(s, "CN-HONGKONG") || strings.HasPrefix(s, "AP-HONGKONG") || strings.Contains(s, "HONG KONG") || s == "HKG" || s == "HK":
		return "HK"
	case strings.HasPrefix(s, "CN-"):
		return "CN"
	case strings.HasPrefix(s, "AP-SINGAPORE") || strings.HasPrefix(s, "AP-SOUTHEAST-1") || strings.Contains(s, "SINGAPORE") || s == "SGP" || s == "SG" || s == "SIN":
		return "SG"
	case strings.HasPrefix(s, "AP-TOKYO") || strings.HasPrefix(s, "AP-NORTHEAST-1") || strings.Contains(s, "JAPAN") || strings.Contains(s, "TOKYO") || strings.Contains(s, "OSAKA") || s == "JP" || s == "NRT":
		return "JP"
	case strings.HasPrefix(s, "AP-SEOUL") || strings.HasPrefix(s, "AP-NORTHEAST-2") || strings.Contains(s, "KOREA") || s == "KR" || s == "ICN":
		return "KR"
	case strings.Contains(s, "GERMANY") || strings.HasPrefix(s, "EU-CENTRAL") || s == "FSN1" || s == "NBG1" || s == "FRA1" || s == "DE":
		return "DE"
	case strings.Contains(s, "FINLAND") || s == "HEL1" || s == "FI":
		return "FI"
	case strings.Contains(s, "NETHERLANDS") || strings.Contains(s, "AMSTERDAM") || s == "AMS1" || s == "AMS3" || s == "NL":
		return "NL"
	case strings.Contains(s, "UNITED KINGDOM") || strings.Contains(s, "LONDON") || s == "LON1" || s == "GB" || s == "UK":
		return "UK"
	case strings.Contains(s, "CANADA") || strings.Contains(s, "TORONTO") || s == "TOR1" || s == "CA":
		return "CA"
	case strings.Contains(s, "AUSTRALIA") || strings.Contains(s, "SYDNEY") || s == "SYD1" || s == "AU":
		return "AU"
	case strings.HasPrefix(s, "US-") || strings.HasPrefix(s, "NA-") || strings.Contains(s, "US,") || strings.Contains(s, "US:") || strings.Contains(s, "LOS ANGELES") || strings.Contains(s, "NEW YORK") || strings.Contains(s, "SAN FRANCISCO") || s == "ASH" || s == "HIL" || s == "NYC1" || s == "NYC3" || s == "SFO2" || s == "SFO3" || s == "US":
		return "US"
	}
	if len(s) >= 2 && len(s) <= 4 {
		return s
	}
	return "US"
}

func parseFlexibleDate(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04Z",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format("2006-01-02")
		}
	}
	if len(s) >= 10 && s[4] == '-' && s[7] == '-' {
		return s[:10]
	}
	return ""
}
