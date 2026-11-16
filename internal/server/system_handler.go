package server

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/updater"
	"github.com/go-chi/chi/v5"
)

const systemLongOpTimeout = 15 * time.Minute

type systemHandler struct {
	store     *storage.Store
	updater   *updater.Service
	restartFn func()
	autoRun   *AutomationRunner
}

type rollbackRequest struct {
	Version         string `json:"version,omitempty"`
	RestoreDatabase bool   `json:"restoreDatabase,omitempty"`
}

func systemRoutes(r chi.Router, store *storage.Store, svc *updater.Service, restartFn func(), autoRun *AutomationRunner) {
	h := &systemHandler{
		store:     store,
		updater:   svc,
		restartFn: restartFn,
		autoRun:   autoRun,
	}
	r.Route("/system", func(sys chi.Router) {
		sys.Get("/version", h.getVersion)
		sys.Get("/storage", h.getStorage)
		sys.Get("/backup/sqlite", h.downloadSQLiteBackup)
		sys.Get("/backup/json", h.downloadJSONExport)
		sys.Get("/check-updates", h.checkUpdates)
		sys.Get("/rollback-versions", h.getRollbackVersions)
		sys.Post("/update", h.performUpdate)
		sys.Post("/rollback", h.rollback)
		sys.Post("/restart", h.restart)
		if autoRun != nil {
			autoRun.routes(sys)
		}
	})
}

func (h *systemHandler) getVersion(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"version":        h.updater.CurrentVersion(),
		"buildType":      h.updater.BuildType(),
		"deploymentMode": h.updater.DeploymentMode(),
		"canSelfUpdate":  h.updater.CanSelfUpdate(),
	})
}

func (h *systemHandler) getStorage(w http.ResponseWriter, r *http.Request) {
	counts, err := h.store.Counts(r.Context())
	if err != nil {
		internalError(w, err)
		return
	}
	integrations, _ := h.store.ListProviderConnections(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"dbSizeBytes":       h.store.DBSizeBytes(r.Context()),
		"counts":            counts,
		"integrationsCount": len(integrations),
		"version":           h.updater.CurrentVersion(),
		"buildType":         h.updater.BuildType(),
		"deploymentMode":    h.updater.DeploymentMode(),
		"canSelfUpdate":     h.updater.CanSelfUpdate(),
	})
}

func (h *systemHandler) downloadSQLiteBackup(w http.ResponseWriter, r *http.Request) {
	tmpFile := filepath.Join(os.TempDir(), "irm-backup-"+rand.Text()+".db")
	defer func() { _ = os.Remove(tmpFile) }()

	if err := h.store.BackupTo(r.Context(), tmpFile); err != nil {
		slog.Error("sqlite online backup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "backup_failed", "生成 SQLite 在线快照失败："+err.Error())
		return
	}

	f, err := os.Open(tmpFile)
	if err != nil {
		internalError(w, err)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		internalError(w, err)
		return
	}

	filename := fmt.Sprintf("irm-snapshot-%s.db", time.Now().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size()))
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
}

func (h *systemHandler) downloadJSONExport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	prefsRow, err := h.store.Preferences(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	var rates map[string]float64
	_ = json.Unmarshal([]byte(prefsRow.RatesJson), &rates)

	accountsRaw, err := h.store.ListAccounts(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	accounts := make([]accountResponse, 0, len(accountsRaw))
	for _, a := range accountsRaw {
		accounts = append(accounts, accountDTO(a))
	}

	subsRaw, err := h.store.ListSubscriptions(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	subscriptions := make([]subscriptionResponse, 0, len(subsRaw))
	for _, s := range subsRaw {
		subscriptions = append(subscriptions, subscriptionDTO(s))
	}

	domainsRaw, err := h.store.ListDomains(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	domains := make([]domainResponse, 0, len(domainsRaw))
	for _, d := range domainsRaw {
		domains = append(domains, domainDTO(d))
	}

	serversRaw, err := h.store.ListServers(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	servers := make([]serverResponse, 0, len(serversRaw))
	for _, srv := range serversRaw {
		servers = append(servers, serverDTO(srv))
	}

	ipsRaw, err := h.store.ListIPs(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	ips := make([]ipResponse, 0, len(ipsRaw))
	for _, ip := range ipsRaw {
		ips = append(ips, ipDTO(ip))
	}

	connsRaw, err := h.store.ListProviderConnections(ctx)
	if err != nil {
		internalError(w, err)
		return
	}
	integrations := make([]providerConnectionResponse, 0, len(connsRaw))
	for _, c := range connsRaw {
		integrations = append(integrations, providerConnectionDTO(c))
	}

	exportPayload := map[string]any{
		"schemaVersion": 1,
		"exportedAt":    time.Now().UTC().Format(time.RFC3339),
		"version":       h.updater.CurrentVersion(),
		"preferences": map[string]any{
			"baseCurrency":   prefsRow.BaseCurrency,
			"rates":          rates,
			"ratesUpdatedAt": prefsRow.RatesUpdatedAt,
		},
		"accounts":      accounts,
		"subscriptions": subscriptions,
		"domains":       domains,
		"servers":       servers,
		"ips":           ips,
		"integrations":  integrations,
	}

	encoded, err := json.MarshalIndent(exportPayload, "", "  ")
	if err != nil {
		internalError(w, err)
		return
	}

	filename := fmt.Sprintf("irm-assets-%s.json", time.Now().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(encoded)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(encoded)
}

func (h *systemHandler) checkUpdates(w http.ResponseWriter, r *http.Request) {
	force := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("force")), "true") ||
		strings.TrimSpace(r.URL.Query().Get("force")) == "1"
	info, err := h.updater.CheckUpdate(r.Context(), force)
	if err != nil {
		slog.Error("check updates failed", "error", err)
		writeError(w, http.StatusBadGateway, "update_check_failed", "检查更新失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *systemHandler) getRollbackVersions(w http.ResponseWriter, r *http.Request) {
	list, err := h.updater.ListRollbackVersions(r.Context())
	if err != nil {
		slog.Error("list rollback versions failed", "error", err)
		writeError(w, http.StatusBadGateway, "rollback_list_failed", "获取历史版本失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *systemHandler) performUpdate(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(systemLongOpTimeout))

	opCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), systemLongOpTimeout)
	defer cancel()

	res, err := h.updater.PerformUpdate(opCtx)
	if err != nil {
		h.writeUpdaterError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":       "更新包校验并替换完成，正在准备重启服务",
		"targetVersion": res.TargetVersion,
		"needRestart":   res.NeedRestart,
	})
}

func (h *systemHandler) rollback(w http.ResponseWriter, r *http.Request) {
	var req rollbackRequest
	if r.ContentLength > 0 {
		if !decodeJSON(w, r, &req) {
			return
		}
	}

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(systemLongOpTimeout))

	opCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), systemLongOpTimeout)
	defer cancel()

	res, err := h.updater.Rollback(opCtx, req.Version, req.RestoreDatabase)
	if err != nil {
		h.writeUpdaterError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":          "版本回退已完成，正在准备重启服务",
		"targetVersion":    res.TargetVersion,
		"restoredDatabase": res.RestoredDatabase,
		"needRestart":      res.NeedRestart,
	})
}

func (h *systemHandler) restart(w http.ResponseWriter, _ *http.Request) {
	if !h.updater.CanSelfUpdate() || h.restartFn == nil {
		writeError(w, http.StatusConflict, "restart_not_supported", "当前运行环境不支持在线重启，请手动重启服务")
		return
	}
	releaseOp, err := h.updater.TryBeginOperation()
	if err != nil {
		h.writeUpdaterError(w, err)
		return
	}
	go func() {
		defer releaseOp()
		time.Sleep(400 * time.Millisecond)
		slog.Info("initiating graceful restart after system update/rollback")
		h.restartFn()
	}()
	writeJSON(w, http.StatusOK, map[string]any{
		"message":    "服务正在重启",
		"restarting": true,
	})
}

func (h *systemHandler) writeUpdaterError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, updater.ErrAlreadyUpToDate):
		writeError(w, http.StatusConflict, "already_up_to_date", "当前已是最新版本，无需更新")
	case errors.Is(err, updater.ErrOperationInProgress):
		writeError(w, http.StatusConflict, "operation_in_progress", "正在执行系统升级或回退操作，请勿重复提交")
	case errors.Is(err, updater.ErrUpdateNotSupported):
		writeError(w, http.StatusConflict, "update_not_supported", "当前为本地开发构建，不支持在线替换二进制，请使用手动命令升级")
	case errors.Is(err, updater.ErrRollbackVersionNotAllowed):
		writeError(w, http.StatusBadRequest, "rollback_version_not_allowed", "所选版本不在允许回退的历史版本列表中")
	case errors.Is(err, updater.ErrNoLocalBackup):
		writeError(w, http.StatusNotFound, "no_local_backup", "未找到本地上一版本备份文件，请选择历史版本下载回退")
	case errors.Is(err, updater.ErrNoDatabaseBackup):
		writeError(w, http.StatusNotFound, "no_database_backup", "未找到目标版本对应的数据库备份快照")
	default:
		slog.Error("system update/rollback failed", "error", err)
		writeError(w, http.StatusBadGateway, "update_failed", "系统版本切换失败："+err.Error())
	}
}
