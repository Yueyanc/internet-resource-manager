package ipaddr

import (
	"errors"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	Categories     = []string{"residential_isp", "cloud_vps", "floating_eip", "transit_relay", "home_ddns", "overlay_subnet"}
	NetworkScopes  = []string{"overseas_exit", "domestic_entry", "overlay_private"}
	AsnTypes       = []string{"residential", "isp", "hosting", "mobile", "business", "private"}
	OriginTypes    = []string{"native", "broadcast", "unknown"}
	RiskLevels     = []string{"clean", "low", "medium", "high", "unassessed"}
	Roles          = []string{"dedicated", "primary", "service", "standby"}
	Statuses       = []string{"active", "degraded", "blocked", "retiring"}
	ReviewCycles   = []string{"none", "monthly", "quarterly", "halfyear", "yearly", "custom"}
	ProbeModes     = []string{"none", "tcp", "http", "https"}
	ProbeStatuses  = []string{"unchecked", "reachable", "unreachable", "skipped_non_public"}
	UnlockServices = []string{"openai", "claude", "gemini", "netflix", "disney_plus", "youtube", "tiktok"}
	UnlockStates   = []string{"unknown", "full", "partial", "blocked"}
	LockableFields = []string{"region", "city", "asn", "asnOrg", "ptrRecord"}

	ErrNonPublicAddress = errors.New("内网、组网或保留网段地址不支持公网归属查询")
	ErrProbeNotAllowed  = errors.New("私网、组网、保留地址或 CIDR 网段不支持主动连通探测")
	ErrProbeDisabled    = errors.New("该节点尚未开启连通探测方式与端口")
	ErrLookupFailed     = errors.New("归属查询暂时不可用，请稍后重试或手动填写")
)

var specialNonPublicPrefixes = func() []netip.Prefix {
	cidrs := []string{
		"0.0.0.0/8",       // RFC 1122 "This host on this network"
		"100.64.0.0/10",   // RFC 6598 Shared Address Space (CGNAT / Tailscale)
		"192.0.0.0/24",    // RFC 6890 IETF Protocol Assignments
		"192.0.2.0/24",    // RFC 5737 TEST-NET-1
		"198.18.0.0/15",   // RFC 2544 Benchmarking
		"198.51.100.0/24", // RFC 5737 TEST-NET-2
		"203.0.113.0/24",  // RFC 5737 TEST-NET-3
		"240.0.0.0/4",     // RFC 1112 Reserved / Broadcast
		"64:ff9b::/96",    // RFC 6052 NAT64 Well-Known Prefix
		"64:ff9b:1::/48",  // RFC 8215 NAT64 Local-Use Prefix
		"100::/64",        // RFC 6666 Discard-Only
		"2001::/32",       // RFC 4380 Teredo
		"2001:2::/48",     // RFC 5180 Benchmarking
		"2001:db8::/32",   // RFC 3849 Documentation
		"2002::/16",       // RFC 3056 6to4 (prevents embedded loopback/private IPv4)
	}
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, raw := range cidrs {
		out = append(out, netip.MustParsePrefix(raw))
	}
	return out
}()

type ParsedAddress struct {
	Canonical      string
	Addr           netip.Addr
	Version        int64
	PrefixLen      int64
	IsPrefix       bool
	PublicRoutable bool
	ProbingAllowed bool
}

// IsPublicRoutable returns true only for globally routable unicast public IP addresses.
func IsPublicRoutable(addr netip.Addr) bool {
	if !addr.IsValid() || addr.Zone() != "" {
		return false
	}
	addr = addr.Unmap()
	if addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified() {
		return false
	}
	for _, p := range specialNonPublicPrefixes {
		if p.Contains(addr) {
			return false
		}
	}
	return true
}

func ParseAddress(raw string) (ParsedAddress, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ParsedAddress{}, errors.New("请输入有效的 IPv4、IPv6 或 CIDR 地址")
	}
	if !strings.Contains(s, "/") && strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]") {
		s = s[1 : len(s)-1]
	}

	if strings.Contains(s, "/") {
		if strings.Contains(s, "%") {
			return ParsedAddress{}, errors.New("地址不支持网卡 Zone 标识")
		}
		prefix, err := netip.ParsePrefix(s)
		if err != nil || !prefix.IsValid() {
			return ParsedAddress{}, errors.New("请输入有效的 CIDR 地址段（如 154.12.34.0/24 或 2a01:4f8::/48）")
		}
		addr := prefix.Addr()
		bits := prefix.Bits()
		if addr.Is4In6() {
			addr = addr.Unmap()
			if bits >= 96 {
				bits -= 96
			} else {
				return ParsedAddress{}, errors.New("IPv4 映射地址前缀长度无效")
			}
		}
		maxBits := 32
		version := int64(4)
		if addr.Is6() {
			maxBits = 128
			version = 6
		}
		if bits < 1 || bits > maxBits {
			return ParsedAddress{}, errors.New("CIDR 前缀长度超出有效范围")
		}
		if addr.IsUnspecified() {
			return ParsedAddress{}, errors.New("不支持录入全零未指定地址")
		}
		if bits == maxBits {
			pub := IsPublicRoutable(addr)
			return ParsedAddress{
				Canonical:      addr.String(),
				Addr:           addr,
				Version:        version,
				PrefixLen:      int64(maxBits),
				IsPrefix:       false,
				PublicRoutable: pub,
				ProbingAllowed: pub,
			}, nil
		}
		masked := netip.PrefixFrom(addr, bits).Masked()
		if masked.Addr().IsUnspecified() {
			return ParsedAddress{}, errors.New("不支持录入默认路由网段")
		}
		pub := IsPublicRoutable(masked.Addr())
		return ParsedAddress{
			Canonical:      masked.String(),
			Addr:           masked.Addr(),
			Version:        version,
			PrefixLen:      int64(bits),
			IsPrefix:       true,
			PublicRoutable: pub,
			ProbingAllowed: false,
		}, nil
	}

	addr, err := netip.ParseAddr(s)
	if err != nil || !addr.IsValid() || addr.Zone() != "" {
		return ParsedAddress{}, errors.New("请输入有效的 IPv4 或 IPv6 地址")
	}
	addr = addr.Unmap()
	if addr.IsUnspecified() {
		return ParsedAddress{}, errors.New("不支持录入 0.0.0.0 或 :: 未指定地址")
	}
	version := int64(4)
	prefixLen := int64(32)
	if addr.Is6() {
		version = 6
		prefixLen = 128
	}
	pub := IsPublicRoutable(addr)
	return ParsedAddress{
		Canonical:      addr.String(),
		Addr:           addr,
		Version:        version,
		PrefixLen:      prefixLen,
		IsPrefix:       false,
		PublicRoutable: pub,
		ProbingAllowed: pub,
	}, nil
}

type UnlockEntry struct {
	Status string `json:"status"`
	Region string `json:"region,omitempty"`
}

type Input struct {
	PresetKey      string                 `json:"presetKey"`
	Address        string                 `json:"address"`
	NetworkScope   string                 `json:"networkScope"`
	Category       string                 `json:"category"`
	Provider       string                 `json:"provider"`
	Label          string                 `json:"label"`
	Region         string                 `json:"region"`
	City           string                 `json:"city"`
	ASN            int64                  `json:"asn"`
	ASNOrg         string                 `json:"asnOrg"`
	PTRRecord      string                 `json:"ptrRecord"`
	ASNType        string                 `json:"asnType"`
	OriginType     string                 `json:"originType"`
	RiskLevel      string                 `json:"riskLevel"`
	PurityNote     string                 `json:"purityNote"`
	Unlocks        map[string]UnlockEntry `json:"unlocks"`
	Tags           []string               `json:"tags"`
	ManualLocks    []string               `json:"manualLocks"`
	LookupSource   string                 `json:"lookupSource,omitempty"`
	Role           string                 `json:"role"`
	Status         string                 `json:"status"`
	ReviewCycle    string                 `json:"reviewCycle"`
	ReviewDays     int64                  `json:"reviewDays"`
	NextReviewDate string                 `json:"nextReviewDate"`
	LastReviewedAt string                 `json:"lastReviewedAt"`
	ProbeMode      string                 `json:"probeMode"`
	ProbePort      int64                  `json:"probePort"`
	SubscriptionID string                 `json:"subscriptionId"`
	HostLabel      string                 `json:"hostLabel"`
	DomainIDs      []string               `json:"domainIds"`
	AccountIDs     []string               `json:"accountIds"`
	ConsoleURL     string                 `json:"consoleUrl"`
	Notes          string                 `json:"notes"`
	Archived       bool                   `json:"archived"`
}

func validPresetKey(key string) bool {
	if len(key) > 64 {
		return false
	}
	for i := range len(key) {
		c := key[i]
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

func validRegion(region string) bool {
	if len(region) < 2 || len(region) > 6 {
		return false
	}
	for i := range len(region) {
		c := region[i]
		if c < 'A' || c > 'Z' {
			return false
		}
	}
	return true
}

func containsCredentialMaterial(values ...string) bool {
	forbidden := []string{
		"vmess://", "vless://", "trojan://", "ss://", "ssr://",
		"hysteria://", "hysteria2://", "hy2://", "tuic://", "socks5://",
		"wireguard://", "-----begin", "private key",
	}
	for _, raw := range values {
		lower := strings.ToLower(raw)
		for _, token := range forbidden {
			if strings.Contains(lower, token) {
				return true
			}
		}
	}
	return false
}

func dedupStrings(items []string, maxCount, maxRuneLen int) ([]string, error) {
	if len(items) == 0 {
		return []string{}, nil
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, raw := range items {
		val := strings.TrimSpace(raw)
		if val == "" {
			continue
		}
		if utf8.RuneCountInString(val) > maxRuneLen {
			return nil, errors.New("标签或关联项长度超出限制")
		}
		if _, exists := seen[val]; exists {
			continue
		}
		seen[val] = struct{}{}
		out = append(out, val)
		if len(out) > maxCount {
			return nil, errors.New("标签或关联项数量超出上限")
		}
	}
	return out, nil
}

func (v *Input) applyDefaults(parsed ParsedAddress) {
	if v.Category == "" {
		if !parsed.PublicRoutable || parsed.IsPrefix {
			v.Category = "overlay_subnet"
		} else {
			v.Category = "cloud_vps"
		}
	}
	if v.NetworkScope == "" {
		if !parsed.PublicRoutable {
			v.NetworkScope = "overlay_private"
		} else {
			v.NetworkScope = "overseas_exit"
		}
	}
	if v.Region == "" {
		switch v.NetworkScope {
		case "domestic_entry":
			v.Region = "CN"
		case "overlay_private":
			v.Region = "LAN"
		default:
			v.Region = "US"
		}
	}
	if v.ASNType == "" {
		if v.NetworkScope == "overlay_private" {
			v.ASNType = "private"
		} else if v.Category == "residential_isp" || v.Category == "home_ddns" {
			v.ASNType = "isp"
		} else {
			v.ASNType = "hosting"
		}
	}
	if v.OriginType == "" {
		v.OriginType = "unknown"
	}
	if v.RiskLevel == "" {
		v.RiskLevel = "unassessed"
	}
	if v.Role == "" {
		v.Role = "primary"
	}
	if v.Status == "" {
		v.Status = "active"
	}
	if v.ReviewCycle == "" {
		v.ReviewCycle = "none"
	}
	if v.ProbeMode == "" {
		v.ProbeMode = "none"
	}
}

func (v *Input) Validate() (ParsedAddress, error) {
	parsed, err := ParseAddress(v.Address)
	if err != nil {
		return ParsedAddress{}, err
	}
	v.Address = parsed.Canonical
	v.PresetKey = strings.TrimSpace(v.PresetKey)
	v.NetworkScope = strings.TrimSpace(v.NetworkScope)
	v.Category = strings.TrimSpace(v.Category)
	v.Provider = strings.TrimSpace(v.Provider)
	v.Label = strings.TrimSpace(v.Label)
	v.Region = strings.ToUpper(strings.TrimSpace(v.Region))
	v.City = strings.TrimSpace(v.City)
	v.ASNOrg = strings.TrimSpace(v.ASNOrg)
	v.PTRRecord = strings.TrimSuffix(strings.TrimSpace(v.PTRRecord), ".")
	v.ASNType = strings.TrimSpace(v.ASNType)
	v.OriginType = strings.TrimSpace(v.OriginType)
	v.RiskLevel = strings.TrimSpace(v.RiskLevel)
	v.PurityNote = strings.TrimSpace(v.PurityNote)
	v.LookupSource = strings.TrimSpace(v.LookupSource)
	v.Role = strings.TrimSpace(v.Role)
	v.Status = strings.TrimSpace(v.Status)
	v.ReviewCycle = strings.TrimSpace(v.ReviewCycle)
	v.NextReviewDate = strings.TrimSpace(v.NextReviewDate)
	v.LastReviewedAt = strings.TrimSpace(v.LastReviewedAt)
	v.ProbeMode = strings.TrimSpace(v.ProbeMode)
	v.SubscriptionID = strings.TrimSpace(v.SubscriptionID)
	v.HostLabel = strings.TrimSpace(v.HostLabel)
	v.ConsoleURL = strings.TrimSpace(v.ConsoleURL)
	v.Notes = strings.TrimSpace(v.Notes)

	v.applyDefaults(parsed)

	if !validPresetKey(v.PresetKey) {
		return ParsedAddress{}, errors.New("预设标识格式无效")
	}
	if !slices.Contains(Categories, v.Category) || !slices.Contains(NetworkScopes, v.NetworkScope) {
		return ParsedAddress{}, errors.New("节点分类或网络域归属无效")
	}
	if !validRegion(v.Region) {
		return ParsedAddress{}, errors.New("地区代码须为 2–6 位大写字母（如 US、JP、HK、CN、LAN）")
	}
	if v.ASN < 0 || v.ASN > 4294967295 {
		return ParsedAddress{}, errors.New("ASN 自治系统号须在 0–4294967295 之间")
	}
	if !slices.Contains(AsnTypes, v.ASNType) || !slices.Contains(OriginTypes, v.OriginType) || !slices.Contains(RiskLevels, v.RiskLevel) {
		return ParsedAddress{}, errors.New("ASN 属性、广播属性或纯净度风险等级无效")
	}
	if !slices.Contains(Roles, v.Role) || !slices.Contains(Statuses, v.Status) {
		return ParsedAddress{}, errors.New("节点角色或运行状态无效")
	}
	if !slices.Contains(ReviewCycles, v.ReviewCycle) {
		return ParsedAddress{}, errors.New("复检周期无效")
	}
	if !slices.Contains(ProbeModes, v.ProbeMode) {
		return ParsedAddress{}, errors.New("连通探测模式无效")
	}
	if containsCredentialMaterial(v.Provider, v.Label, v.PurityNote, v.HostLabel, v.Notes) {
		return ParsedAddress{}, errors.New("安全红线：请勿在节点台账中填入代理连接串、密码或私钥")
	}
	if utf8.RuneCountInString(v.Provider) > 100 ||
		utf8.RuneCountInString(v.Label) > 80 ||
		utf8.RuneCountInString(v.City) > 100 ||
		utf8.RuneCountInString(v.ASNOrg) > 200 ||
		utf8.RuneCountInString(v.PTRRecord) > 255 ||
		utf8.RuneCountInString(v.PurityNote) > 160 ||
		utf8.RuneCountInString(v.HostLabel) > 100 ||
		utf8.RuneCountInString(v.Notes) > 2000 ||
		len(v.ConsoleURL) > 2000 ||
		len(v.SubscriptionID) > 64 ||
		len(v.LookupSource) > 40 {
		return ParsedAddress{}, errors.New("节点补充信息超出长度限制")
	}

	normalizedUnlocks := make(map[string]UnlockEntry, len(UnlockServices))
	for key, entry := range v.Unlocks {
		if !slices.Contains(UnlockServices, key) {
			return ParsedAddress{}, errors.New("包含不支持的解锁检测平台标识")
		}
		state := strings.TrimSpace(entry.Status)
		if state == "" {
			state = "unknown"
		}
		if !slices.Contains(UnlockStates, state) {
			return ParsedAddress{}, errors.New("解锁状态取值无效")
		}
		region := strings.ToUpper(strings.TrimSpace(entry.Region))
		if region != "" && !validRegion(region) {
			return ParsedAddress{}, errors.New("解锁区服代码须为 2–6 位大写字母")
		}
		if state == "unknown" {
			region = ""
		}
		if state != "unknown" {
			normalizedUnlocks[key] = UnlockEntry{Status: state, Region: region}
		}
	}
	v.Unlocks = normalizedUnlocks

	tags, err := dedupStrings(v.Tags, 12, 32)
	if err != nil {
		return ParsedAddress{}, err
	}
	for _, tag := range tags {
		if containsCredentialMaterial(tag) {
			return ParsedAddress{}, errors.New("标签中不得包含代理协议或密钥内容")
		}
	}
	v.Tags = tags

	locks, err := dedupStrings(v.ManualLocks, len(LockableFields), 24)
	if err != nil {
		return ParsedAddress{}, err
	}
	for _, lock := range locks {
		if !slices.Contains(LockableFields, lock) {
			return ParsedAddress{}, errors.New("人工锁定字段名无效")
		}
	}
	v.ManualLocks = locks

	domains, err := dedupStrings(v.DomainIDs, 50, 64)
	if err != nil {
		return ParsedAddress{}, err
	}
	v.DomainIDs = domains

	accounts, err := dedupStrings(v.AccountIDs, 50, 64)
	if err != nil {
		return ParsedAddress{}, err
	}
	v.AccountIDs = accounts

	if v.ReviewCycle == "none" {
		v.ReviewDays = 0
		v.NextReviewDate = ""
	} else {
		if v.NextReviewDate == "" {
			return ParsedAddress{}, errors.New("开启纯净度周期复检时请选择下次复检日期")
		}
		if _, err := NextReviewDate(v.NextReviewDate, v.ReviewCycle, int(v.ReviewDays)); err != nil {
			return ParsedAddress{}, err
		}
		if v.ReviewCycle != "custom" {
			v.ReviewDays = 0
		}
	}
	if v.LastReviewedAt != "" {
		if _, err := time.Parse("2006-01-02", v.LastReviewedAt); err != nil {
			return ParsedAddress{}, errors.New("上次复检日期格式无效")
		}
	}

	if v.ProbeMode == "none" {
		v.ProbePort = 0
	} else if v.ProbePort < 1 || v.ProbePort > 65535 {
		return ParsedAddress{}, errors.New("启用连通探测时，端口号须在 1–65535 之间")
	}

	if v.ConsoleURL != "" {
		u, err := url.Parse(v.ConsoleURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return ParsedAddress{}, errors.New("商家控制台网址须为不含账号密码的 HTTP 或 HTTPS 链接")
		}
	}
	return parsed, nil
}

// NextReviewDate advances a YYYY-MM-DD date by one review cycle, clamping end-of-month dates.
func NextReviewDate(date, cycle string, days int) (string, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", errors.New("请输入有效的复检日期")
	}
	months := map[string]int{"monthly": 1, "quarterly": 3, "halfyear": 6, "yearly": 12}
	var next time.Time
	if cycle == "custom" {
		if days < 1 || days > 3650 {
			return "", errors.New("自定义复检间隔须为 1–3650 天")
		}
		next = d.AddDate(0, 0, days)
	} else if n, ok := months[cycle]; ok {
		first := time.Date(d.Year(), d.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
		last := first.AddDate(0, 1, -1).Day()
		next = first.AddDate(0, 0, min(d.Day(), last)-1)
	} else {
		return "", errors.New("该节点未开启周期复检")
	}
	if next.Year() > 9999 {
		return "", errors.New("复检日期超出范围")
	}
	return next.Format("2006-01-02"), nil
}

// AdvanceReview computes the next review deadline from reviewedOn while guaranteeing strict forward progress.
func AdvanceReview(currentDue, reviewedOn, cycle string, days int) (string, string, error) {
	if reviewedOn == "" {
		reviewedOn = time.Now().UTC().Format("2006-01-02")
	} else if _, err := time.Parse("2006-01-02", reviewedOn); err != nil {
		return "", "", errors.New("请输入有效的复检打卡日期")
	}
	candidate, err := NextReviewDate(reviewedOn, cycle, days)
	if err != nil {
		return "", "", err
	}
	if candidate <= currentDue {
		candidate, err = NextReviewDate(currentDue, cycle, days)
		if err != nil {
			return "", "", err
		}
	}
	return candidate, reviewedOn, nil
}
