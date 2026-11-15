package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/updater"
	"github.com/go-chi/chi/v5"
)

const systemLongOpTimeout = 15 * time.Minute

type systemHandler struct {
	updater   *updater.Service
	restartFn func()
}

type rollbackRequest struct {
	Version         string `json:"version,omitempty"`
	RestoreDatabase bool   `json:"restoreDatabase,omitempty"`
}

func systemRoutes(r chi.Router, svc *updater.Service, restartFn func()) {
	h := &systemHandler{
		updater:   svc,
		restartFn: restartFn,
	}
	r.Route("/system", func(sys chi.Router) {
		sys.Get("/version", h.getVersion)
		sys.Get("/check-updates", h.checkUpdates)
		sys.Get("/rollback-versions", h.getRollbackVersions)
		sys.Post("/update", h.performUpdate)
		sys.Post("/rollback", h.rollback)
		sys.Post("/restart", h.restart)
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
