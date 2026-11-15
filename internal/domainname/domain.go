package domainname

import (
	"errors"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
)

var (
	Purposes    = []string{"prod", "personal", "mail", "cdn", "parked"}
	Statuses    = []string{"active", "parked", "transferring", "retiring"}
	ICPStatuses = []string{"none", "verified", "pending"}
)

type ValidationError struct {
	Code    string
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

type Input struct {
	PresetKey          string              `json:"presetKey"`
	Name               string              `json:"name"`
	Registrar          string              `json:"registrar"`
	DNSProvider        string              `json:"dnsProvider"`
	Purpose            string              `json:"purpose"`
	Status             string              `json:"status"`
	ExpireDate         string              `json:"expireDate"`
	AutoRenew          *bool               `json:"autoRenew"`
	WhoisPrivacy       *bool               `json:"whoisPrivacy"`
	ICPStatus          string              `json:"icpStatus"`
	ICPNumber          string              `json:"icpNumber"`
	ManagementURL      string              `json:"managementUrl"`
	SubscriptionID     string              `json:"subscriptionId"`
	CreateSubscription *subscription.Input `json:"createSubscription,omitempty"`
	RegistrarAccountID string              `json:"registrarAccountId"`
	ServerIDs          []string            `json:"serverIds"`
	IPIDs              []string            `json:"ipIds"`
	Tags               []string            `json:"tags"`
	Notes              string              `json:"notes"`
	Archived           bool                `json:"archived"`
}

func (v Input) AutoRenewEnabled() bool {
	if v.AutoRenew == nil {
		return true
	}
	return *v.AutoRenew
}

func (v Input) WhoisPrivacyEnabled() bool {
	if v.WhoisPrivacy == nil {
		return true
	}
	return *v.WhoisPrivacy
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

func dedupeIDs(items []string, limit int) ([]string, error) {
	if items == nil {
		return nil, nil
	}
	if len(items) > limit {
		return nil, &ValidationError{Code: "invalid_domain_meta", Message: "关联资源数量超出上限"}
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, raw := range items {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if len(id) > 64 {
			return nil, &ValidationError{Code: "invalid_domain_meta", Message: "关联资源标识无效"}
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out, nil
}

func normalizeTags(items []string) ([]string, error) {
	if len(items) > 20 {
		return nil, &ValidationError{Code: "invalid_domain_meta", Message: "标签数量不能超过 20 个"}
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, raw := range items {
		tag := strings.TrimSpace(raw)
		if tag == "" {
			continue
		}
		if utf8.RuneCountInString(tag) > 32 {
			return nil, &ValidationError{Code: "invalid_domain_meta", Message: "单个标签长度不能超过 32 个字符"}
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	return out, nil
}

func (v *Input) Normalize() error {
	name, err := NormalizeName(v.Name)
	if err != nil {
		return &ValidationError{Code: "invalid_domain", Message: "请输入有效域名，不包含协议、路径或端口"}
	}
	v.Name = name

	v.PresetKey = strings.TrimSpace(v.PresetKey)
	if !validPresetKey(v.PresetKey) {
		return &ValidationError{Code: "invalid_domain_meta", Message: "预设标识无效"}
	}

	v.Registrar = strings.TrimSpace(v.Registrar)
	v.DNSProvider = strings.TrimSpace(v.DNSProvider)
	v.Purpose = strings.TrimSpace(v.Purpose)
	if v.Purpose == "" {
		v.Purpose = "prod"
	}
	if !slices.Contains(Purposes, v.Purpose) {
		return &ValidationError{Code: "invalid_domain_meta", Message: "域名用途无效"}
	}

	v.Status = strings.TrimSpace(v.Status)
	if v.Status == "" {
		v.Status = "active"
	}
	if !slices.Contains(Statuses, v.Status) {
		return &ValidationError{Code: "invalid_domain_meta", Message: "域名状态无效"}
	}

	v.ICPStatus = strings.TrimSpace(v.ICPStatus)
	if v.ICPStatus == "" {
		v.ICPStatus = "none"
	}
	if !slices.Contains(ICPStatuses, v.ICPStatus) {
		return &ValidationError{Code: "invalid_domain_meta", Message: "备案状态无效"}
	}

	v.ICPNumber = strings.TrimSpace(v.ICPNumber)
	if v.ICPStatus == "none" {
		v.ICPNumber = ""
	}

	v.ExpireDate = strings.TrimSpace(v.ExpireDate)
	if v.ExpireDate != "" {
		if _, err := time.Parse("2006-01-02", v.ExpireDate); err != nil {
			return &ValidationError{Code: "invalid_domain_meta", Message: "请输入有效的到期日期"}
		}
	}

	v.ManagementURL = strings.TrimSpace(v.ManagementURL)
	if v.ManagementURL != "" {
		u, err := url.Parse(v.ManagementURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return &ValidationError{Code: "invalid_domain_meta", Message: "控制台网址须为不含账号密码的 HTTP 或 HTTPS 链接"}
		}
	}

	v.SubscriptionID = strings.TrimSpace(v.SubscriptionID)
	v.RegistrarAccountID = strings.TrimSpace(v.RegistrarAccountID)
	v.Notes = strings.TrimSpace(v.Notes)

	if utf8.RuneCountInString(v.Notes) > 2000 {
		return &ValidationError{Code: "invalid_notes", Message: "备注不能超过 2000 个字符"}
	}
	if utf8.RuneCountInString(v.Registrar) > 100 ||
		utf8.RuneCountInString(v.DNSProvider) > 100 ||
		utf8.RuneCountInString(v.ICPNumber) > 100 ||
		len(v.ManagementURL) > 2000 ||
		len(v.SubscriptionID) > 64 ||
		len(v.RegistrarAccountID) > 64 {
		return &ValidationError{Code: "invalid_domain_meta", Message: "补充信息过长"}
	}

	if v.SubscriptionID != "" && v.CreateSubscription != nil {
		return &ValidationError{Code: "invalid_domain_meta", Message: "不能同时选择已有订阅并新建关联订阅"}
	}
	if v.CreateSubscription != nil {
		if err := v.CreateSubscription.Validate(); err != nil {
			var target *ValidationError
			if errors.As(err, &target) {
				return target
			}
			return &ValidationError{Code: "invalid_subscription", Message: err.Error()}
		}
	}

	servers, err := dedupeIDs(v.ServerIDs, 100)
	if err != nil {
		return err
	}
	v.ServerIDs = servers

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
