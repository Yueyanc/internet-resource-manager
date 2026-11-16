package storage

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

const automationAAD = "automation:1"

type AutomationConfig struct {
	ExpiryLeadDays           int    `json:"expiryLeadDays"`
	DailyDigestHour          int    `json:"dailyDigestHour"`
	NotifyOnServerOffline    bool   `json:"notifyOnServerOffline"`
	TrafficAlertThresholdPct int    `json:"trafficAlertThresholdPct"`
	AutoAdvanceSubscriptions bool   `json:"autoAdvanceSubscriptions"`
	AutoSyncEnabled          bool   `json:"autoSyncEnabled"`
	AutoSyncIntervalHours    int    `json:"autoSyncIntervalHours"`
	TelegramEnabled          bool   `json:"telegramEnabled"`
	TelegramChatID           string `json:"telegramChatId"`
	BarkEnabled              bool   `json:"barkEnabled"`
	BarkServerURL            string `json:"barkServerUrl"`
	WebhookEnabled           bool   `json:"webhookEnabled"`
}

type AutomationSecrets struct {
	TelegramBotToken string `json:"telegramBotToken"`
	BarkDeviceKey    string `json:"barkDeviceKey"`
	WebhookURL       string `json:"webhookUrl"`
}

type AutomationState struct {
	LastDigestDate string            `json:"lastDigestDate"`
	LastAutoSyncAt string            `json:"lastAutoSyncAt"`
	OfflineAlerted map[string]string `json:"offlineAlerted,omitempty"`
	TrafficAlerted map[string]string `json:"trafficAlerted,omitempty"`
}

type AutomationRecord struct {
	Config     AutomationConfig
	Secrets    AutomationSecrets
	State      AutomationState
	LastRunAt  string
	LastStatus string
	LastError  string
	UpdatedAt  string
}

func DefaultAutomationConfig() AutomationConfig {
	return AutomationConfig{
		ExpiryLeadDays:           14,
		DailyDigestHour:          9,
		NotifyOnServerOffline:    true,
		TrafficAlertThresholdPct: 85,
		AutoAdvanceSubscriptions: true,
		AutoSyncEnabled:          true,
		AutoSyncIntervalHours:    6,
		TelegramEnabled:          false,
		TelegramChatID:           "",
		BarkEnabled:              false,
		BarkServerURL:            "https://api.day.app",
		WebhookEnabled:           false,
	}
}

func (c *AutomationConfig) NormalizeAndValidate(secrets AutomationSecrets) error {
	if c.ExpiryLeadDays < 1 || c.ExpiryLeadDays > 90 {
		return errors.New("提前提醒天数须为 1–90 天")
	}
	if c.DailyDigestHour < 0 || c.DailyDigestHour > 23 {
		return errors.New("每日巡检推送时间须为 0–23 点")
	}
	if c.TrafficAlertThresholdPct < 0 || c.TrafficAlertThresholdPct > 100 {
		return errors.New("月流量告警阈值须为 0–100%")
	}
	if c.AutoSyncIntervalHours < 1 || c.AutoSyncIntervalHours > 168 {
		return errors.New("后台自动同步间隔须为 1–168 小时")
	}
	c.TelegramChatID = strings.TrimSpace(c.TelegramChatID)
	c.BarkServerURL = strings.TrimRight(strings.TrimSpace(c.BarkServerURL), "/")
	if c.BarkServerURL == "" {
		c.BarkServerURL = "https://api.day.app"
	} else {
		u, err := url.Parse(c.BarkServerURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return errors.New("Bark 服务地址须为有效的 HTTP/HTTPS 地址")
		}
	}
	if c.TelegramEnabled && (strings.TrimSpace(secrets.TelegramBotToken) == "" || c.TelegramChatID == "") {
		return errors.New("启用 Telegram 通知时须填写 Bot Token 与 Chat ID")
	}
	if c.BarkEnabled && strings.TrimSpace(secrets.BarkDeviceKey) == "" {
		return errors.New("启用 Bark 推送时须填写 Device Key")
	}
	if c.WebhookEnabled {
		rawWebhook := strings.TrimSpace(secrets.WebhookURL)
		if rawWebhook == "" {
			return errors.New("启用 Webhook 通知时须填写 Webhook URL")
		}
		u, err := url.Parse(rawWebhook)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
			return errors.New("Webhook URL 须为有效的 HTTP/HTTPS 地址")
		}
	}
	return nil
}

func (s *Store) GetAutomation(ctx context.Context) (AutomationRecord, error) {
	row, err := s.queries.GetAutomationSettings(ctx)
	if err != nil {
		return AutomationRecord{}, err
	}
	cfg := DefaultAutomationConfig()
	if row.ConfigJson != "" {
		_ = json.Unmarshal([]byte(row.ConfigJson), &cfg)
	}
	var secrets AutomationSecrets
	if len(row.SecretCiphertext) > 0 && len(row.SecretNonce) > 0 {
		_ = s.keyRing.OpenJSON(automationAAD, row.SecretCiphertext, row.SecretNonce, &secrets)
	}
	var state AutomationState
	if row.StateJson != "" {
		_ = json.Unmarshal([]byte(row.StateJson), &state)
	}
	if state.OfflineAlerted == nil {
		state.OfflineAlerted = make(map[string]string)
	}
	if state.TrafficAlerted == nil {
		state.TrafficAlerted = make(map[string]string)
	}
	return AutomationRecord{
		Config:     cfg,
		Secrets:    secrets,
		State:      state,
		LastRunAt:  row.LastRunAt,
		LastStatus: row.LastStatus,
		LastError:  row.LastError,
		UpdatedAt:  row.UpdatedAt,
	}, nil
}

func (s *Store) SaveAutomation(ctx context.Context, cfg AutomationConfig, secrets AutomationSecrets) (AutomationRecord, error) {
	secrets.TelegramBotToken = strings.TrimSpace(secrets.TelegramBotToken)
	secrets.BarkDeviceKey = strings.TrimSpace(secrets.BarkDeviceKey)
	secrets.WebhookURL = strings.TrimSpace(secrets.WebhookURL)
	if err := cfg.NormalizeAndValidate(secrets); err != nil {
		return AutomationRecord{}, err
	}
	cfgBytes, err := json.Marshal(cfg)
	if err != nil {
		return AutomationRecord{}, err
	}
	ciphertext, nonce, err := s.keyRing.SealJSON(automationAAD, secrets)
	if err != nil {
		return AutomationRecord{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.queries.SaveAutomationConfig(ctx, queries.SaveAutomationConfigParams{
		ConfigJson:       string(cfgBytes),
		SecretCiphertext: ciphertext,
		SecretNonce:      nonce,
		UpdatedAt:        now,
	}); err != nil {
		return AutomationRecord{}, err
	}
	return s.GetAutomation(ctx)
}

func (s *Store) UpdateAutomationRunState(ctx context.Context, state AutomationState, lastRunAt, status, errMsg string) error {
	stateBytes, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return s.queries.UpdateAutomationRunState(ctx, queries.UpdateAutomationRunStateParams{
		StateJson:  string(stateBytes),
		LastRunAt:  lastRunAt,
		LastStatus: status,
		LastError:  errMsg,
	})
}

func (s *Store) DBSizeBytes(ctx context.Context) int64 {
	var total int64
	if s.dbPath != "" && s.dbPath != ":memory:" && !strings.HasPrefix(s.dbPath, "file::memory:") {
		for _, p := range []string{s.dbPath, s.dbPath + "-wal", s.dbPath + "-shm"} {
			if info, err := os.Stat(p); err == nil && !info.IsDir() {
				total += info.Size()
			}
		}
	}
	if total > 0 {
		return total
	}
	var pageCount, pageSize int64
	if err := s.db.QueryRowContext(ctx, "PRAGMA page_count;").Scan(&pageCount); err == nil {
		if err := s.db.QueryRowContext(ctx, "PRAGMA page_size;").Scan(&pageSize); err == nil {
			return pageCount * pageSize
		}
	}
	return 0
}
