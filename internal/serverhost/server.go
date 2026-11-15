package serverhost

import (
	"errors"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
)

var (
	Kinds        = []string{"vps", "dedicated", "nat", "homelab", "nas"}
	Statuses     = []string{"active", "standby", "maintenance", "retiring"}
	Arches       = []string{"amd64", "arm64", "other"}
	DiskTypes    = []string{"", "nvme", "ssd", "hdd", "raid"}
	TrafficRules = []string{"both", "out_only", "unlimited"}
)

type Input struct {
	PresetKey          string              `json:"presetKey"`
	Name               string              `json:"name"`
	Hostname           string              `json:"hostname"`
	Provider           string              `json:"provider"`
	Kind               string              `json:"kind"`
	Status             string              `json:"status"`
	Region             string              `json:"region"`
	Datacenter         string              `json:"datacenter"`
	OS                 string              `json:"os"`
	Arch               string              `json:"arch"`
	CPUCores           int64               `json:"cpuCores"`
	MemoryMB           int64               `json:"memoryMb"`
	DiskGB             int64               `json:"diskGb"`
	DiskType           string              `json:"diskType"`
	BandwidthMbps      int64               `json:"bandwidthMbps"`
	TrafficGB          int64               `json:"trafficGb"`
	TrafficRule        string              `json:"trafficRule"`
	TrafficResetDay    int64               `json:"trafficResetDay"`
	IPv4               string              `json:"ipv4"`
	IPv6               string              `json:"ipv6"`
	PrivateIP          string              `json:"privateIp"`
	PortNote           string              `json:"portNote"`
	SSHPort            int64               `json:"sshPort"`
	SSHUser            string              `json:"sshUser"`
	ConsoleURL         string              `json:"consoleUrl"`
	SubscriptionID     string              `json:"subscriptionId"`
	CreateSubscription *subscription.Input `json:"createSubscription,omitempty"`
	AccountID          string              `json:"accountId"`
	ExpireDate         string              `json:"expireDate"`
	DomainIDs          []string            `json:"domainIds"`
	IPIDs              []string            `json:"ipIds"`
	Tags               []string            `json:"tags"`
	Notes              string              `json:"notes"`
	Archived           bool                `json:"archived"`
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
	if len(region) < 2 || len(region) > 8 {
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

func validHostname(host string) bool {
	if host == "" {
		return true
	}
	if len(host) > 253 {
		return false
	}
	for i := range len(host) {
		c := host[i]
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_') {
			return false
		}
	}
	return host[0] != '-' && host[0] != '.' && host[len(host)-1] != '-'
}

func validSSHUser(user string) bool {
	if user == "" {
		return true
	}
	if len(user) > 64 {
		return false
	}
	for i := range len(user) {
		c := user[i]
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.') {
			return false
		}
	}
	return user[0] != '-'
}

func containsPrivateKeyMaterial(values ...string) bool {
	for _, value := range values {
		upper := strings.ToUpper(value)
		if strings.Contains(upper, "PRIVATE KEY-----") || strings.Contains(upper, "OPENSSH PRIVATE KEY") {
			return true
		}
	}
	return false
}

func dedupeIDs(values []string, limit int) ([]string, error) {
	if len(values) > limit {
		return nil, errors.New("关联资源数量超出上限")
	}
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, raw := range values {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if len(id) > 64 {
			return nil, errors.New("关联资源标识无效")
		}
		if _, ok := seen[id]; !ok {
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out, nil
}

func normalizeTags(values []string) ([]string, error) {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, raw := range values {
		tag := strings.TrimSpace(raw)
		if tag == "" {
			continue
		}
		if utf8.RuneCountInString(tag) > 32 {
			return nil, errors.New("单个标签不能超过 32 个字符")
		}
		key := strings.ToLower(tag)
		if _, ok := seen[key]; !ok {
			seen[key] = struct{}{}
			out = append(out, tag)
		}
	}
	if len(out) > 12 {
		return nil, errors.New("标签最多填写 12 个")
	}
	return out, nil
}

func (v *Input) applyDefaults() {
	if v.Kind == "" {
		v.Kind = "vps"
	}
	if v.Status == "" {
		v.Status = "active"
	}
	if v.Region == "" {
		if v.Kind == "homelab" || v.Kind == "nas" {
			v.Region = "LOCAL"
		} else {
			v.Region = "HK"
		}
	}
	if v.Arch == "" {
		v.Arch = "amd64"
	}
	if v.TrafficRule == "" {
		v.TrafficRule = "both"
	}
}

func (v *Input) Validate() error {
	v.PresetKey = strings.TrimSpace(v.PresetKey)
	v.Name = strings.TrimSpace(v.Name)
	v.Hostname = strings.ToLower(strings.TrimSpace(v.Hostname))
	v.Provider = strings.TrimSpace(v.Provider)
	v.Kind = strings.TrimSpace(v.Kind)
	v.Status = strings.TrimSpace(v.Status)
	v.Region = strings.ToUpper(strings.TrimSpace(v.Region))
	v.Datacenter = strings.TrimSpace(v.Datacenter)
	v.OS = strings.TrimSpace(v.OS)
	v.Arch = strings.TrimSpace(v.Arch)
	v.DiskType = strings.TrimSpace(v.DiskType)
	v.TrafficRule = strings.TrimSpace(v.TrafficRule)
	v.IPv4 = strings.TrimSpace(v.IPv4)
	v.IPv6 = strings.Trim(strings.TrimSpace(v.IPv6), "[]")
	v.PrivateIP = strings.Trim(strings.TrimSpace(v.PrivateIP), "[]")
	v.PortNote = strings.TrimSpace(v.PortNote)
	v.SSHUser = strings.TrimSpace(v.SSHUser)
	v.ConsoleURL = strings.TrimSpace(v.ConsoleURL)
	v.SubscriptionID = strings.TrimSpace(v.SubscriptionID)
	v.AccountID = strings.TrimSpace(v.AccountID)
	v.ExpireDate = strings.TrimSpace(v.ExpireDate)
	v.Notes = strings.TrimSpace(v.Notes)

	v.applyDefaults()

	if !validPresetKey(v.PresetKey) {
		return errors.New("预设标识格式无效")
	}
	if v.Name == "" || utf8.RuneCountInString(v.Name) > 100 {
		return errors.New("服务器名称须为 1–100 个字符")
	}
	if !validHostname(v.Hostname) {
		return errors.New("主机名仅支持字母、数字、点、短横线或下划线")
	}
	if !slices.Contains(Kinds, v.Kind) || !slices.Contains(Statuses, v.Status) || !slices.Contains(Arches, v.Arch) {
		return errors.New("服务器类型、状态或架构无效")
	}
	if !validRegion(v.Region) {
		return errors.New("地区代码须为 2–8 位大写字母（如 HK、US、JP、LOCAL）")
	}
	if !slices.Contains(DiskTypes, v.DiskType) || !slices.Contains(TrafficRules, v.TrafficRule) {
		return errors.New("磁盘类型或流量计费规则无效")
	}
	if v.CPUCores < 0 || v.CPUCores > 1024 ||
		v.MemoryMB < 0 || v.MemoryMB > 16777216 ||
		v.DiskGB < 0 || v.DiskGB > 1048576 ||
		v.BandwidthMbps < 0 || v.BandwidthMbps > 1000000 ||
		v.TrafficGB < 0 || v.TrafficGB > 1048576 ||
		v.TrafficResetDay < 0 || v.TrafficResetDay > 31 {
		return errors.New("硬件规格或流量配额超出合理范围")
	}
	if v.TrafficRule == "unlimited" {
		v.TrafficGB = 0
	}
	if v.SSHPort < 0 || v.SSHPort > 65535 {
		return errors.New("SSH 端口须为 0–65535 之间的整数")
	}
	if !validSSHUser(v.SSHUser) {
		return errors.New("SSH 用户名格式无效（仅记录用户名，切勿输入密码或命令）")
	}
	if containsPrivateKeyMaterial(v.Notes, v.PortNote, v.SSHUser) {
		return errors.New("严禁在台账或备注中保存 SSH 私钥凭据")
	}
	if utf8.RuneCountInString(v.Provider) > 100 ||
		utf8.RuneCountInString(v.Datacenter) > 100 ||
		utf8.RuneCountInString(v.OS) > 100 ||
		utf8.RuneCountInString(v.PortNote) > 200 ||
		utf8.RuneCountInString(v.Notes) > 2000 ||
		len(v.ConsoleURL) > 2000 ||
		len(v.SubscriptionID) > 64 ||
		len(v.AccountID) > 64 {
		return errors.New("补充信息过长")
	}

	if v.IPv4 != "" {
		addr, err := netip.ParseAddr(v.IPv4)
		if err != nil || !addr.Is4() {
			return errors.New("主 IPv4 地址格式无效（无需附带端口或掩码）")
		}
		v.IPv4 = addr.String()
	}
	if v.IPv6 != "" {
		addr, err := netip.ParseAddr(v.IPv6)
		if err != nil || !addr.Is6() || addr.Is4In6() {
			return errors.New("主 IPv6 地址格式无效（无需附带掩码）")
		}
		v.IPv6 = addr.String()
	}
	if v.PrivateIP != "" {
		addr, err := netip.ParseAddr(v.PrivateIP)
		if err != nil {
			return errors.New("内网或组网 IP 地址格式无效")
		}
		v.PrivateIP = addr.String()
	}

	if v.ConsoleURL != "" {
		u, err := url.Parse(v.ConsoleURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return errors.New("控制台网址须为不含账号密码的 HTTP 或 HTTPS 链接")
		}
	}

	if v.ExpireDate != "" {
		if _, err := time.Parse("2006-01-02", v.ExpireDate); err != nil {
			return errors.New("请输入有效的到期日期")
		}
	}

	if v.SubscriptionID != "" && v.CreateSubscription != nil {
		return errors.New("不能同时选择已有订阅并新建关联订阅")
	}
	if v.CreateSubscription != nil {
		if err := v.CreateSubscription.Validate(); err != nil {
			return err
		}
	}

	domains, err := dedupeIDs(v.DomainIDs, 100)
	if err != nil {
		return err
	}
	v.DomainIDs = domains

	ips, err := dedupeIDs(v.IPIDs, 100)
	if err != nil {
		return err
	}
	v.IPIDs = ips

	tags, err := normalizeTags(v.Tags)
	if err != nil {
		return err
	}
	v.Tags = tags

	return nil
}
