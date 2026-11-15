package subscription

import (
	"errors"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/account"
)

var Currencies = []string{"CNY", "USD", "HKD", "EUR", "GBP", "JPY"}
var Categories = []string{"ai", "cloud", "network", "software", "life", "telecom", "other"}

type Input struct {
	PresetKey            string         `json:"presetKey"`
	Name                 string         `json:"name"`
	AmountMinor          int64          `json:"amountMinor"`
	Currency             string         `json:"currency"`
	Cycle                string         `json:"cycle"`
	IntervalDays         int64          `json:"intervalDays"`
	DueDate              string         `json:"dueDate"`
	Category             string         `json:"category"`
	RenewalMode          string         `json:"renewalMode"`
	Intention            string         `json:"intention"`
	RenewalAmountMinor   int64          `json:"renewalAmountMinor"`
	AccountID            string         `json:"accountId"`
	CreateAccount        *account.Input `json:"createAccount,omitempty"`
	BillingAccountID     string         `json:"billingAccountId"`
	CreateBillingAccount *account.Input `json:"createBillingAccount,omitempty"`
	Account              string         `json:"account"`
	PaymentMethod        string         `json:"paymentMethod"`
	ManagementURL        string         `json:"managementUrl"`
	Notes                string         `json:"notes"`
	Archived             bool           `json:"archived"`
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

func (v *Input) Validate() error {
	v.PresetKey = strings.TrimSpace(v.PresetKey)
	v.Name = strings.TrimSpace(v.Name)
	v.AccountID = strings.TrimSpace(v.AccountID)
	v.BillingAccountID = strings.TrimSpace(v.BillingAccountID)
	v.Account = strings.TrimSpace(v.Account)
	v.PaymentMethod = strings.TrimSpace(v.PaymentMethod)
	v.ManagementURL = strings.TrimSpace(v.ManagementURL)
	v.Notes = strings.TrimSpace(v.Notes)
	if !validPresetKey(v.PresetKey) {
		return errors.New("预设标识格式无效")
	}
	if v.Name == "" || utf8.RuneCountInString(v.Name) > 100 {
		return errors.New("订阅名称须为 1–100 个字符")
	}
	if v.AmountMinor < 0 || v.AmountMinor > 100000000000 || v.RenewalAmountMinor < 0 || v.RenewalAmountMinor > 100000000000 {
		return errors.New("金额须为 0–10 亿之间的数值")
	}
	if !slices.Contains(Currencies, v.Currency) || !slices.Contains(Categories, v.Category) {
		return errors.New("币种或分类无效")
	}
	if !slices.Contains([]string{"auto", "manual"}, v.RenewalMode) || !slices.Contains([]string{"normal", "cancel", "keep"}, v.Intention) {
		return errors.New("续费方式或续退意向无效")
	}
	if _, err := time.Parse("2006-01-02", v.DueDate); err != nil {
		return errors.New("请输入有效日期")
	}
	if v.Cycle != "once" {
		if _, err := NextDate(v.DueDate, v.Cycle, int(v.IntervalDays)); err != nil {
			return err
		}
	}
	if v.Cycle != "custom" {
		v.IntervalDays = 0
	}
	if len(v.AccountID) > 64 || len(v.BillingAccountID) > 64 || utf8.RuneCountInString(v.Account) > 200 || utf8.RuneCountInString(v.PaymentMethod) > 200 || utf8.RuneCountInString(v.Notes) > 2000 || len(v.ManagementURL) > 2000 {
		return errors.New("补充信息过长")
	}
	if v.AccountID != "" && v.CreateAccount != nil {
		return errors.New("不能同时选择已有归属账号并新建账号")
	}
	if v.BillingAccountID != "" && v.CreateBillingAccount != nil {
		return errors.New("不能同时选择已有代扣账号并新建账号")
	}
	if v.CreateAccount != nil {
		if err := v.CreateAccount.Validate(); err != nil {
			return err
		}
	}
	if v.CreateBillingAccount != nil {
		if err := v.CreateBillingAccount.Validate(); err != nil {
			return err
		}
	}
	if v.BillingAccountID != "" && v.BillingAccountID == v.AccountID {
		v.BillingAccountID = ""
	}
	if v.ManagementURL != "" {
		u, err := url.Parse(v.ManagementURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return errors.New("管理网址须为不含账号密码的 HTTP 或 HTTPS 链接")
		}
	}
	return nil
}

// Add calendar months, clamping to the target month's last day rather than rolling over.
func NextDate(date, cycle string, days int) (string, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", errors.New("请输入有效日期")
	}
	months := map[string]int{"monthly": 1, "quarterly": 3, "halfyear": 6, "yearly": 12, "biennial": 24, "triennial": 36}
	var next time.Time
	if cycle == "custom" {
		if days < 1 || days > 3650 {
			return "", errors.New("自定义间隔须为 1–3650 天")
		}
		next = d.AddDate(0, 0, days)
	} else if n, ok := months[cycle]; ok {
		first := time.Date(d.Year(), d.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
		last := first.AddDate(0, 1, -1).Day()
		next = first.AddDate(0, 0, min(d.Day(), last)-1)
	} else {
		return "", errors.New("该计费周期不支持顺延")
	}
	if next.Year() > 9999 {
		return "", errors.New("到期日期超出范围")
	}
	return next.Format("2006-01-02"), nil
}
