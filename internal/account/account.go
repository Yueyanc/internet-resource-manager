package account

import (
	"errors"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	Categories         = []string{"email", "social", "ecosystem", "dev_cloud", "ai_productivity", "media_gaming", "finance_commerce", "other"}
	Ecosystems         = []string{"domestic", "overseas"}
	Roles              = []string{"hub", "primary", "alt"}
	Statuses           = []string{"active", "retiring", "restricted"}
	AuthMethods        = []string{"password", "passkey", "sso", "code"}
	TwoFactorMethods   = []string{"none", "sms", "email", "totp", "passkey", "hardware"}
	RecoveryCodeStates = []string{"not_applicable", "saved", "missing"}
	KycStatuses        = []string{"none", "verified"}
	KeepaliveCycles    = []string{"none", "monthly", "quarterly", "halfyear", "yearly", "custom"}
)

type Input struct {
	PresetKey         string `json:"presetKey"`
	Platform          string `json:"platform"`
	Label             string `json:"label"`
	Identifier        string `json:"identifier"`
	UID               string `json:"uid"`
	Category          string `json:"category"`
	Ecosystem         string `json:"ecosystem"`
	Region            string `json:"region"`
	Role              string `json:"role"`
	Status            string `json:"status"`
	AuthMethod        string `json:"authMethod"`
	RecoveryAccountID string `json:"recoveryAccountId"`
	RecoveryEmail     string `json:"recoveryEmail"`
	SSOAccountID      string `json:"ssoAccountId"`
	PhoneHint         string `json:"phoneHint"`
	TwoFactor         string `json:"twoFactor"`
	RecoveryCodes     string `json:"recoveryCodes"`
	KycStatus         string `json:"kycStatus"`
	KycNote           string `json:"kycNote"`
	KeepaliveCycle    string `json:"keepaliveCycle"`
	KeepaliveDays     int64  `json:"keepaliveDays"`
	NextCheckinDate   string `json:"nextCheckinDate"`
	LastCheckedAt     string `json:"lastCheckedAt"`
	VaultReference    string `json:"vaultReference"`
	SecurityURL       string `json:"securityUrl"`
	Notes             string `json:"notes"`
	Archived          bool   `json:"archived"`
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

func hasLongDigitRun(value string, limit int) bool {
	run := 0
	for _, r := range value {
		if r >= '0' && r <= '9' {
			run++
			if run >= limit {
				return true
			}
		} else {
			run = 0
		}
	}
	return false
}

func (v *Input) applyDefaults() {
	if v.Ecosystem == "" {
		v.Ecosystem = "overseas"
	}
	if v.Region == "" {
		if v.Ecosystem == "domestic" {
			v.Region = "CN"
		} else {
			v.Region = "GLOBAL"
		}
	}
	if v.Role == "" {
		v.Role = "primary"
	}
	if v.Status == "" {
		v.Status = "active"
	}
	if v.AuthMethod == "" {
		v.AuthMethod = "password"
	}
	if v.TwoFactor == "" {
		v.TwoFactor = "none"
	}
	if v.RecoveryCodes == "" {
		v.RecoveryCodes = "not_applicable"
	}
	if v.KycStatus == "" {
		v.KycStatus = "none"
	}
	if v.KeepaliveCycle == "" {
		v.KeepaliveCycle = "none"
	}
}

func (v *Input) Validate() error {
	v.PresetKey = strings.TrimSpace(v.PresetKey)
	v.Platform = strings.TrimSpace(v.Platform)
	v.Label = strings.TrimSpace(v.Label)
	v.Identifier = strings.TrimSpace(v.Identifier)
	v.UID = strings.TrimSpace(v.UID)
	v.Category = strings.TrimSpace(v.Category)
	v.Ecosystem = strings.TrimSpace(v.Ecosystem)
	v.Region = strings.ToUpper(strings.TrimSpace(v.Region))
	v.Role = strings.TrimSpace(v.Role)
	v.Status = strings.TrimSpace(v.Status)
	v.AuthMethod = strings.TrimSpace(v.AuthMethod)
	v.RecoveryAccountID = strings.TrimSpace(v.RecoveryAccountID)
	v.RecoveryEmail = strings.TrimSpace(v.RecoveryEmail)
	v.SSOAccountID = strings.TrimSpace(v.SSOAccountID)
	v.PhoneHint = strings.TrimSpace(v.PhoneHint)
	v.TwoFactor = strings.TrimSpace(v.TwoFactor)
	v.RecoveryCodes = strings.TrimSpace(v.RecoveryCodes)
	v.KycStatus = strings.TrimSpace(v.KycStatus)
	v.KycNote = strings.TrimSpace(v.KycNote)
	v.KeepaliveCycle = strings.TrimSpace(v.KeepaliveCycle)
	v.NextCheckinDate = strings.TrimSpace(v.NextCheckinDate)
	v.LastCheckedAt = strings.TrimSpace(v.LastCheckedAt)
	v.VaultReference = strings.TrimSpace(v.VaultReference)
	v.SecurityURL = strings.TrimSpace(v.SecurityURL)
	v.Notes = strings.TrimSpace(v.Notes)

	v.applyDefaults()

	if !validPresetKey(v.PresetKey) {
		return errors.New("预设标识格式无效")
	}
	if v.Platform == "" || utf8.RuneCountInString(v.Platform) > 100 {
		return errors.New("平台名称须为 1–100 个字符")
	}
	if v.Identifier == "" || utf8.RuneCountInString(v.Identifier) > 200 {
		return errors.New("登录标识须为 1–200 个字符")
	}
	if !slices.Contains(Categories, v.Category) || !slices.Contains(Ecosystems, v.Ecosystem) {
		return errors.New("分类或生态归属无效")
	}
	if !validRegion(v.Region) {
		return errors.New("区服代码须为 2–6 位大写字母（如 CN、US、HK、GLOBAL）")
	}
	if !slices.Contains(Roles, v.Role) || !slices.Contains(Statuses, v.Status) || !slices.Contains(AuthMethods, v.AuthMethod) {
		return errors.New("账号角色、状态或登录方式无效")
	}
	if !slices.Contains(TwoFactorMethods, v.TwoFactor) || !slices.Contains(RecoveryCodeStates, v.RecoveryCodes) || !slices.Contains(KycStatuses, v.KycStatus) {
		return errors.New("安全验证或实名状态无效")
	}
	if !slices.Contains(KeepaliveCycles, v.KeepaliveCycle) {
		return errors.New("保活周期无效")
	}
	if hasLongDigitRun(v.KycNote, 15) {
		return errors.New("实名备注仅填写主体代号（如本人），请勿输入证件号码")
	}
	if hasLongDigitRun(v.PhoneHint, 15) {
		return errors.New("手机绑定提示仅记录国家码与尾号掩码，请勿输入完整卡号或证件号")
	}
	if utf8.RuneCountInString(v.Label) > 60 ||
		utf8.RuneCountInString(v.UID) > 100 ||
		utf8.RuneCountInString(v.PhoneHint) > 80 ||
		utf8.RuneCountInString(v.KycNote) > 60 ||
		utf8.RuneCountInString(v.RecoveryEmail) > 200 ||
		utf8.RuneCountInString(v.VaultReference) > 200 ||
		utf8.RuneCountInString(v.Notes) > 2000 ||
		len(v.SecurityURL) > 2000 ||
		len(v.RecoveryAccountID) > 64 ||
		len(v.SSOAccountID) > 64 {
		return errors.New("补充信息过长")
	}
	if v.KycStatus == "none" {
		v.KycNote = ""
	}
	if v.KeepaliveCycle == "none" {
		v.KeepaliveDays = 0
		v.NextCheckinDate = ""
	} else {
		if v.NextCheckinDate == "" {
			return errors.New("开启防回收保活时请选择下次保活日期")
		}
		if _, err := NextCheckinDate(v.NextCheckinDate, v.KeepaliveCycle, int(v.KeepaliveDays)); err != nil {
			return err
		}
		if v.KeepaliveCycle != "custom" {
			v.KeepaliveDays = 0
		}
	}
	if v.LastCheckedAt != "" {
		if _, err := time.Parse("2006-01-02", v.LastCheckedAt); err != nil {
			return errors.New("上次保活日期格式无效")
		}
	}
	if v.SecurityURL != "" {
		u, err := url.Parse(v.SecurityURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return errors.New("安全管理网址须为不含账号密码的 HTTP 或 HTTPS 链接")
		}
	}
	return nil
}

// NextCheckinDate advances a YYYY-MM-DD date by one keep-alive cycle, clamping end-of-month dates.
func NextCheckinDate(date, cycle string, days int) (string, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", errors.New("请输入有效的保活日期")
	}
	months := map[string]int{"monthly": 1, "quarterly": 3, "halfyear": 6, "yearly": 12}
	var next time.Time
	if cycle == "custom" {
		if days < 1 || days > 3650 {
			return "", errors.New("自定义保活间隔须为 1–3650 天")
		}
		next = d.AddDate(0, 0, days)
	} else if n, ok := months[cycle]; ok {
		first := time.Date(d.Year(), d.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
		last := first.AddDate(0, 1, -1).Day()
		next = first.AddDate(0, 0, min(d.Day(), last)-1)
	} else {
		return "", errors.New("该账号未开启周期保活")
	}
	if next.Year() > 9999 {
		return "", errors.New("保活日期超出范围")
	}
	return next.Format("2006-01-02"), nil
}

// AdvanceCheckin computes the next keep-alive deadline from checkedOn while guaranteeing strict forward progress.
func AdvanceCheckin(currentDue, checkedOn, cycle string, days int) (string, string, error) {
	if checkedOn == "" {
		checkedOn = time.Now().UTC().Format("2006-01-02")
	} else if _, err := time.Parse("2006-01-02", checkedOn); err != nil {
		return "", "", errors.New("请输入有效的打卡日期")
	}
	candidate, err := NextCheckinDate(checkedOn, cycle, days)
	if err != nil {
		return "", "", err
	}
	if candidate <= currentDue {
		candidate, err = NextCheckinDate(currentDue, cycle, days)
		if err != nil {
			return "", "", err
		}
	}
	return candidate, checkedOn, nil
}
