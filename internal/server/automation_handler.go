package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

type AutomationRunner struct {
	store           *storage.Store
	registry        *cloudsync.Registry
	domainLookuper  domainname.Lookuper
	httpClient      *http.Client
	telegramBaseURL string
	nowFn           func() time.Time
	mu              sync.Mutex
}

type InspectionSummary struct {
	RanAt                 string   `json:"ranAt"`
	SubscriptionsAdvanced int      `json:"subscriptionsAdvanced"`
	ProvidersSynced       int      `json:"providersSynced"`
	DomainsRefreshed      int      `json:"domainsRefreshed"`
	ExpiringCount         int      `json:"expiringCount"`
	OfflineServers        int      `json:"offlineServers"`
	TrafficAlerts         int      `json:"trafficAlerts"`
	NotificationsSent     []string `json:"notificationsSent"`
	ChannelErrors         []string `json:"channelErrors"`
}

type automationSettingsResponse struct {
	storage.AutomationConfig
	HasTelegramBotToken  bool   `json:"hasTelegramBotToken"`
	TelegramBotTokenHint string `json:"telegramBotTokenHint"`
	HasBarkDeviceKey     bool   `json:"hasBarkDeviceKey"`
	BarkDeviceKeyHint    string `json:"barkDeviceKeyHint"`
	HasWebhookURL        bool   `json:"hasWebhookUrl"`
	WebhookURLHint       string `json:"webhookUrlHint"`
	LastRunAt            string `json:"lastRunAt"`
	LastStatus           string `json:"lastStatus"`
	LastError            string `json:"lastError"`
	LastDigestDate       string `json:"lastDigestDate"`
	LastAutoSyncAt       string `json:"lastAutoSyncAt"`
	UpdatedAt            string `json:"updatedAt"`
}

type automationSaveRequest struct {
	storage.AutomationConfig
	TelegramBotToken      string `json:"telegramBotToken"`
	BarkDeviceKey         string `json:"barkDeviceKey"`
	WebhookURL            string `json:"webhookUrl"`
	ClearTelegramBotToken bool   `json:"clearTelegramBotToken"`
	ClearBarkDeviceKey    bool   `json:"clearBarkDeviceKey"`
	ClearWebhookURL       bool   `json:"clearWebhookUrl"`
}

func NewAutomationRunner(store *storage.Store, opts ...Option) *AutomationRunner {
	cfg := buildHandlerConfig(opts...)
	return newAutomationRunnerFromConfig(store, cfg)
}

func newAutomationRunnerFromConfig(store *storage.Store, cfg handlerConfig) *AutomationRunner {
	client := cfg.notifyHTTPClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	tgBase := strings.TrimRight(cfg.telegramBaseURL, "/")
	if tgBase == "" {
		tgBase = "https://api.telegram.org"
	}
	return &AutomationRunner{
		store:           store,
		registry:        cfg.cloudRegistry,
		domainLookuper:  cfg.domainLookuper,
		httpClient:      client,
		telegramBaseURL: tgBase,
		nowFn:           time.Now,
	}
}

func (ar *AutomationRunner) RunLoop(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	startupTimer := time.NewTimer(15 * time.Second)
	defer startupTimer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-startupTimer.C:
		if _, err := ar.RunInspection(ctx, false); err != nil && !errors.Is(err, context.Canceled) {
			slog.Warn("initial background automation inspection failed", "error", err)
		}
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := ar.RunInspection(ctx, false); err != nil && !errors.Is(err, context.Canceled) {
				slog.Warn("scheduled background automation inspection failed", "error", err)
			}
		}
	}
}

func maskSecretHint(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if len(s) <= 8 {
		return "••••"
	}
	return s[:4] + "••••" + s[len(s)-4:]
}

func maskURLHint(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return maskSecretHint(raw)
	}
	suffix := ""
	if len(raw) > 4 {
		suffix = raw[len(raw)-4:]
	}
	return fmt.Sprintf("%s://%s/...••••%s", u.Scheme, u.Host, suffix)
}

func automationDTO(rec storage.AutomationRecord) automationSettingsResponse {
	return automationSettingsResponse{
		AutomationConfig:     rec.Config,
		HasTelegramBotToken:  rec.Secrets.TelegramBotToken != "",
		TelegramBotTokenHint: maskSecretHint(rec.Secrets.TelegramBotToken),
		HasBarkDeviceKey:     rec.Secrets.BarkDeviceKey != "",
		BarkDeviceKeyHint:    maskSecretHint(rec.Secrets.BarkDeviceKey),
		HasWebhookURL:        rec.Secrets.WebhookURL != "",
		WebhookURLHint:       maskURLHint(rec.Secrets.WebhookURL),
		LastRunAt:            rec.LastRunAt,
		LastStatus:           rec.LastStatus,
		LastError:            rec.LastError,
		LastDigestDate:       rec.State.LastDigestDate,
		LastAutoSyncAt:       rec.State.LastAutoSyncAt,
		UpdatedAt:            rec.UpdatedAt,
	}
}

func mergeAutomationSecrets(existing storage.AutomationSecrets, req automationSaveRequest) storage.AutomationSecrets {
	out := existing
	if req.ClearTelegramBotToken {
		out.TelegramBotToken = ""
	} else if strings.TrimSpace(req.TelegramBotToken) != "" {
		out.TelegramBotToken = strings.TrimSpace(req.TelegramBotToken)
	}
	if req.ClearBarkDeviceKey {
		out.BarkDeviceKey = ""
	} else if strings.TrimSpace(req.BarkDeviceKey) != "" {
		out.BarkDeviceKey = strings.TrimSpace(req.BarkDeviceKey)
	}
	if req.ClearWebhookURL {
		out.WebhookURL = ""
	} else if strings.TrimSpace(req.WebhookURL) != "" {
		out.WebhookURL = strings.TrimSpace(req.WebhookURL)
	}
	return out
}

func (ar *AutomationRunner) routes(sys chi.Router) {
	sys.Get("/automation", func(w http.ResponseWriter, r *http.Request) {
		rec, err := ar.store.GetAutomation(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, automationDTO(rec))
	})

	sys.Put("/automation", func(w http.ResponseWriter, r *http.Request) {
		var req automationSaveRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		existing, err := ar.store.GetAutomation(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		secrets := mergeAutomationSecrets(existing.Secrets, req)
		saved, err := ar.store.SaveAutomation(r.Context(), req.AutomationConfig, secrets)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_automation", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, automationDTO(saved))
	})

	sys.Post("/automation/test-notify", func(w http.ResponseWriter, r *http.Request) {
		existing, err := ar.store.GetAutomation(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		cfg := existing.Config
		secrets := existing.Secrets
		if r.ContentLength > 0 {
			var req automationSaveRequest
			if !decodeJSON(w, r, &req) {
				return
			}
			cfg = req.AutomationConfig
			secrets = mergeAutomationSecrets(existing.Secrets, req)
		}
		if err := cfg.NormalizeAndValidate(secrets); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_automation", err.Error())
			return
		}
		if !cfg.TelegramEnabled && !cfg.BarkEnabled && !cfg.WebhookEnabled {
			writeError(w, http.StatusBadRequest, "no_channel_enabled", "请至少启用并配置一个通知渠道（Telegram / Bark / Webhook）")
			return
		}
		now := ar.nowFn().Format("2006-01-02 15:04:05")
		title := "资源管家 · 测试通知"
		body := fmt.Sprintf("这是一条来自资源管家实例的连通性测试消息。\n发送时间：%s\n状态：通知与巡检通道工作正常。", now)
		sent, errs := ar.DispatchNotification(r.Context(), cfg, secrets, "test", title, body)
		if len(errs) > 0 {
			writeError(w, http.StatusBadGateway, "notify_failed", "通知发送失败："+strings.Join(errs, "；"))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sentChannels": sent,
			"timestamp":    now,
		})
	})

	sys.Post("/automation/run", func(w http.ResponseWriter, r *http.Request) {
		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Now().Add(3 * time.Minute))

		runCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
		defer cancel()

		summary, err := ar.RunInspection(runCtx, true)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "inspection_failed", "执行巡检失败："+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, summary)
	})
}

func (ar *AutomationRunner) DispatchNotification(
	ctx context.Context,
	cfg storage.AutomationConfig,
	secrets storage.AutomationSecrets,
	eventKind string,
	title string,
	body string,
) ([]string, []string) {
	sent := []string{}
	errs := []string{}
	fullText := title + "\n\n" + body

	if cfg.TelegramEnabled && secrets.TelegramBotToken != "" && cfg.TelegramChatID != "" {
		tgURL := fmt.Sprintf("%s/bot%s/sendMessage", ar.telegramBaseURL, secrets.TelegramBotToken)
		payload := map[string]any{
			"chat_id":                  cfg.TelegramChatID,
			"text":                     fullText,
			"disable_web_page_preview": true,
		}
		if err := ar.postJSON(ctx, tgURL, payload); err != nil {
			errs = append(errs, "Telegram: "+err.Error())
		} else {
			sent = append(sent, "telegram")
		}
	}

	if cfg.BarkEnabled && secrets.BarkDeviceKey != "" {
		barkBase := strings.TrimRight(cfg.BarkServerURL, "/")
		if barkBase == "" {
			barkBase = "https://api.day.app"
		}
		payload := map[string]any{
			"device_key": secrets.BarkDeviceKey,
			"title":      title,
			"body":       body,
			"group":      "资源管家",
		}
		if err := ar.postJSON(ctx, barkBase+"/push", payload); err != nil {
			errs = append(errs, "Bark: "+err.Error())
		} else {
			sent = append(sent, "bark")
		}
	}

	if cfg.WebhookEnabled && secrets.WebhookURL != "" {
		payload := buildWebhookPayload(secrets.WebhookURL, eventKind, title, body, fullText, ar.nowFn())
		if err := ar.postJSON(ctx, secrets.WebhookURL, payload); err != nil {
			errs = append(errs, "Webhook: "+err.Error())
		} else {
			sent = append(sent, "webhook")
		}
	}

	return sent, errs
}

func buildWebhookPayload(rawURL, eventKind, title, body, fullText string, now time.Time) map[string]any {
	lower := strings.ToLower(rawURL)
	switch {
	case strings.Contains(lower, "open.feishu.cn") || strings.Contains(lower, "open.larksuite.com"):
		return map[string]any{
			"msg_type": "text",
			"content":  map[string]string{"text": fullText},
		}
	case strings.Contains(lower, "qyapi.weixin.qq.com") || strings.Contains(lower, "oapi.dingtalk.com"):
		return map[string]any{
			"msgtype": "text",
			"text":    map[string]string{"content": fullText},
		}
	case strings.Contains(lower, "discord.com/api/webhooks") || strings.Contains(lower, "discordapp.com/api/webhooks"):
		return map[string]any{"content": fullText}
	case strings.Contains(lower, "hooks.slack.com"):
		return map[string]any{"text": fullText}
	default:
		return map[string]any{
			"event":     eventKind,
			"title":     title,
			"message":   body,
			"text":      fullText,
			"timestamp": now.UTC().Format(time.RFC3339),
		}
	}
}

func (ar *AutomationRunner) postJSON(ctx context.Context, targetURL string, payload any) error {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("User-Agent", "internet-resource-manager/1.0")

	resp, err := ar.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		msg := strings.TrimSpace(string(snippet))
		if msg != "" {
			return fmt.Errorf("HTTP %d (%s)", resp.StatusCode, msg)
		}
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

func daysBetweenYMD(todayYMD, targetYMD string) (int, bool) {
	if todayYMD == "" || targetYMD == "" {
		return 0, false
	}
	t0, err0 := time.Parse("2006-01-02", todayYMD)
	t1, err1 := time.Parse("2006-01-02", targetYMD)
	if err0 != nil || err1 != nil {
		return 0, false
	}
	return int(t1.Sub(t0).Hours() / 24), true
}

func (ar *AutomationRunner) RunInspection(ctx context.Context, force bool) (InspectionSummary, error) {
	ar.mu.Lock()
	defer ar.mu.Unlock()

	now := ar.nowFn()
	nowUTC := now.UTC().Format(time.RFC3339)
	today := now.Format("2006-01-02")

	summary := InspectionSummary{
		RanAt:             nowUTC,
		NotificationsSent: []string{},
		ChannelErrors:     []string{},
	}

	rec, err := ar.store.GetAutomation(ctx)
	if err != nil {
		return summary, err
	}
	cfg := rec.Config
	state := rec.State

	// 1. Auto-advance overdue active auto-renewing subscriptions.
	if cfg.AutoAdvanceSubscriptions {
		if advanced, advErr := ar.store.AutoAdvanceSubscriptions(ctx, today); advErr == nil {
			summary.SubscriptionsAdvanced = len(advanced)
		}
	}

	// 2. Scheduled silent CloudSync + expiring domain RDAP refresh.
	shouldSync := force
	if !shouldSync && cfg.AutoSyncEnabled {
		if state.LastAutoSyncAt == "" {
			shouldSync = true
		} else if lastSync, pErr := time.Parse(time.RFC3339, state.LastAutoSyncAt); pErr != nil || now.Sub(lastSync) >= time.Duration(cfg.AutoSyncIntervalHours)*time.Hour {
			shouldSync = true
		}
	}

	if shouldSync {
		if ar.registry != nil {
			conns, cErr := ar.store.ListProviderConnections(ctx)
			if cErr == nil {
				for _, conn := range conns {
					syncCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
					_, _, sErr := runProviderSync(syncCtx, ar.store, ar.registry, ar.domainLookuper, conn)
					cancel()
					if sErr == nil {
						summary.ProvidersSynced++
					}
				}
			}
		}

		if ar.domainLookuper != nil {
			domains, dErr := ar.store.ListDomains(ctx)
			if dErr == nil {
				refreshed := 0
				windowDays := max(cfg.ExpiryLeadDays*2, 30)
				for _, d := range domains {
					if refreshed >= 8 || d.Domain.Archived != 0 {
						continue
					}
					needsLookup := d.Domain.ExpireDate == ""
					if !needsLookup {
						if rem, ok := daysBetweenYMD(today, d.Domain.ExpireDate); ok && rem <= windowDays {
							needsLookup = true
						}
					}
					if !needsLookup {
						continue
					}
					if !force && d.Domain.LookupCheckedAt != "" {
						if checked, pErr := time.Parse(time.RFC3339, d.Domain.LookupCheckedAt); pErr == nil && now.Sub(checked) < 24*time.Hour {
							continue
						}
					}
					lCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
					res, lErr := ar.domainLookuper.Lookup(lCtx, d.Domain.Name)
					cancel()
					if lErr == nil {
						if _, uErr := ar.store.ApplyDomainLookup(ctx, d.Domain.ID, &res, nil, false); uErr == nil {
							refreshed++
						}
					} else {
						_, _ = ar.store.ApplyDomainLookup(ctx, d.Domain.ID, nil, lErr, false)
					}
				}
				summary.DomainsRefreshed = refreshed
			}
		}
		state.LastAutoSyncAt = nowUTC
	}

	// 3. Server offline & monthly traffic threshold anomaly checks.
	var realtimeAlerts []string
	servers, _ := ar.store.ListServers(ctx)
	for _, s := range servers {
		if s.Server.Archived != 0 {
			continue
		}
		if s.Telemetry.Mode == "daemon" {
			if s.Telemetry.AgentStatus == "stale" {
				summary.OfflineServers++
				if cfg.NotifyOnServerOffline {
					if _, already := state.OfflineAlerted[s.Server.ID]; !already {
						realtimeAlerts = append(realtimeAlerts, fmt.Sprintf("• [探针失联] 服务器 %s 心跳超时", s.Server.Name))
						state.OfflineAlerted[s.Server.ID] = nowUTC
					}
				}
			} else if s.Telemetry.AgentStatus == "online" {
				delete(state.OfflineAlerted, s.Server.ID)
			}
		}

		if cfg.TrafficAlertThresholdPct > 0 && s.Server.TrafficGb > 0 && s.Server.TrafficRule != "unlimited" {
			usedBytes := s.Telemetry.TrafficRxBytes + s.Telemetry.TrafficTxBytes
			if s.Server.TrafficRule == "out_only" {
				usedBytes = s.Telemetry.TrafficTxBytes
			}
			quotaBytes := s.Server.TrafficGb * 1024 * 1024 * 1024
			if quotaBytes > 0 && usedBytes > 0 {
				pct := int((usedBytes * 100) / quotaBytes)
				if pct >= cfg.TrafficAlertThresholdPct {
					summary.TrafficAlerts++
					cycleKey := s.Telemetry.TrafficCycleKey
					if cycleKey == "" {
						cycleKey = now.Format("2006-01")
					}
					if state.TrafficAlerted[s.Server.ID] != cycleKey {
						realtimeAlerts = append(realtimeAlerts, fmt.Sprintf("• [流量预警] 服务器 %s 本周期流量已达 %d%%（配额 %d GB）", s.Server.Name, pct, s.Server.TrafficGb))
						state.TrafficAlerted[s.Server.ID] = cycleKey
					}
				}
			}
		}
	}

	// 4. Expiring assets evaluation (subscriptions, domains, account keepalive, IP review).
	var digestLines []string
	subs, _ := ar.store.ListSubscriptions(ctx)
	for _, sub := range subs {
		if sub.Archived != 0 {
			continue
		}
		rem, ok := daysBetweenYMD(today, sub.DueDate)
		if !ok || rem > cfg.ExpiryLeadDays {
			continue
		}
		if sub.RenewalMode == "manual" || sub.Intention == "cancel" || rem <= 3 {
			tag := "续费提醒"
			if sub.Intention == "cancel" && sub.RenewalMode == "auto" {
				tag = "待取消止损"
			}
			digestLines = append(digestLines, fmt.Sprintf("• [%s] 订阅 %s：%s（%s）", tag, sub.Name, formatRemainText(rem), sub.DueDate))
		}
	}

	domains, _ := ar.store.ListDomains(ctx)
	for _, d := range domains {
		if d.Domain.Archived != 0 {
			continue
		}
		rem, ok := daysBetweenYMD(today, d.Domain.ExpireDate)
		if !ok || rem > cfg.ExpiryLeadDays {
			continue
		}
		if d.Domain.AutoRenew == 0 || rem <= 7 {
			digestLines = append(digestLines, fmt.Sprintf("• [域名到期] %s：%s（%s）", d.Domain.Name, formatRemainText(rem), d.Domain.ExpireDate))
		}
	}

	accounts, _ := ar.store.ListAccounts(ctx)
	for _, a := range accounts {
		if a.Archived != 0 || a.NextCheckinDate == "" {
			continue
		}
		rem, ok := daysBetweenYMD(today, a.NextCheckinDate)
		if ok && rem <= cfg.ExpiryLeadDays {
			label := a.Platform
			if a.Label != "" {
				label += " · " + a.Label
			}
			digestLines = append(digestLines, fmt.Sprintf("• [账号保活] %s：%s（%s）", label, formatRemainText(rem), a.NextCheckinDate))
		}
	}

	ips, _ := ar.store.ListIPs(ctx)
	for _, ip := range ips {
		if ip.Ip.Archived != 0 || ip.Ip.NextReviewDate == "" {
			continue
		}
		rem, ok := daysBetweenYMD(today, ip.Ip.NextReviewDate)
		if ok && rem <= cfg.ExpiryLeadDays {
			digestLines = append(digestLines, fmt.Sprintf("• [IP 复检] %s：%s（%s）", ip.Ip.Address, formatRemainText(rem), ip.Ip.NextReviewDate))
		}
	}
	summary.ExpiringCount = len(digestLines)

	shouldSendDigest := len(digestLines) > 0 && (force || (now.Hour() >= cfg.DailyDigestHour && state.LastDigestDate != today))

	hasEnabledChannel := cfg.TelegramEnabled || cfg.BarkEnabled || cfg.WebhookEnabled
	var messageSections []string
	if len(realtimeAlerts) > 0 {
		messageSections = append(messageSections, "【实时异常告警】\n"+strings.Join(realtimeAlerts, "\n"))
	}
	if shouldSendDigest {
		messageSections = append(messageSections, fmt.Sprintf("【%d 天内到期与待办（%d 项）】\n%s", cfg.ExpiryLeadDays, len(digestLines), strings.Join(digestLines, "\n")))
	}

	status := "ok"
	errMsg := ""
	if hasEnabledChannel && len(messageSections) > 0 {
		sent, chErrs := ar.DispatchNotification(ctx, cfg, rec.Secrets, "inspection", "资源管家 · 资产巡检提醒", strings.Join(messageSections, "\n\n"))
		summary.NotificationsSent = sent
		summary.ChannelErrors = chErrs
		if len(chErrs) > 0 {
			status = "warning"
			errMsg = strings.Join(chErrs, "；")
		} else if shouldSendDigest {
			state.LastDigestDate = today
		}
	} else if shouldSendDigest && !hasEnabledChannel && !force {
		state.LastDigestDate = today
	}

	_ = ar.store.UpdateAutomationRunState(ctx, state, nowUTC, status, errMsg)
	return summary, nil
}

func formatRemainText(days int) string {
	switch {
	case days < 0:
		return fmt.Sprintf("已逾期 %d 天", -days)
	case days == 0:
		return "今天到期"
	default:
		return fmt.Sprintf("剩 %d 天", days)
	}
}
