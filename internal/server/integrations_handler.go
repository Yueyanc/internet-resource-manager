package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/go-chi/chi/v5"
)

type providerConnectionResponse struct {
	ID                  string            `json:"id"`
	Provider            string            `json:"provider"`
	Label               string            `json:"label"`
	AccountID           string            `json:"accountId"`
	TokenHint           string            `json:"tokenHint"`
	Scopes              []string          `json:"scopes"`
	ExternalAccountName string            `json:"externalAccountName"`
	Status              string            `json:"status"`
	LastSyncedAt        string            `json:"lastSyncedAt"`
	LastError           string            `json:"lastError"`
	Stats               storage.SyncStats `json:"stats"`
	CreatedAt           string            `json:"createdAt"`
	UpdatedAt           string            `json:"updatedAt"`
}

func providerConnectionDTO(row queries.ProviderConnection) providerConnectionResponse {
	var acctID string
	if row.AccountID.Valid {
		acctID = row.AccountID.String
	}
	var scopes []string
	if row.ScopesJson != "" {
		_ = json.Unmarshal([]byte(row.ScopesJson), &scopes)
	}
	if scopes == nil {
		scopes = []string{}
	}
	var stats storage.SyncStats
	if row.StatsJson != "" {
		_ = json.Unmarshal([]byte(row.StatsJson), &stats)
	}
	return providerConnectionResponse{
		ID:                  row.ID,
		Provider:            row.Provider,
		Label:               row.Label,
		AccountID:           acctID,
		TokenHint:           row.TokenHint,
		Scopes:              scopes,
		ExternalAccountName: row.ExternalAccountName,
		Status:              row.Status,
		LastSyncedAt:        row.LastSyncedAt,
		LastError:           row.LastError,
		Stats:               stats,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
}

func runCloudflareSync(
	ctx context.Context,
	store *storage.Store,
	cfClient cloudsync.CloudflareClient,
	lookuper domainname.Lookuper,
	conn queries.ProviderConnection,
) (queries.ProviderConnection, storage.SyncStats, error) {
	token, err := store.DecryptCloudflareToken(conn)
	if err != nil {
		updated, _ := store.RecordProviderSyncError(ctx, conn, err)
		return updated, storage.SyncStats{}, err
	}
	snap, err := cfClient.FetchSnapshot(ctx, token)
	if err != nil {
		updated, _ := store.RecordProviderSyncError(ctx, conn, err)
		return updated, storage.SyncStats{}, err
	}
	return store.ReconcileCloudflareSnapshot(ctx, conn, snap, lookuper)
}

func integrationRoutes(
	api chi.Router,
	store *storage.Store,
	cfClient cloudsync.CloudflareClient,
	lookuper domainname.Lookuper,
) {
	api.Get("/integrations/cloudflare/template", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, cloudsync.CloudflareTokenTemplates())
	})

	api.Get("/integrations", func(w http.ResponseWriter, r *http.Request) {
		rows, err := store.ListProviderConnections(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]providerConnectionResponse, 0, len(rows))
		for _, row := range rows {
			items = append(items, providerConnectionDTO(row))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	api.Post("/integrations/cloudflare", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			APIToken  string `json:"apiToken"`
			Label     string `json:"label"`
			AccountID string `json:"accountId"`
			SyncNow   *bool  `json:"syncNow"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		cleanLabel := strings.TrimSpace(req.Label)
		if utf8.RuneCountInString(cleanLabel) > 64 {
			writeError(w, http.StatusBadRequest, "invalid_integration", "连接备注名称不能超过 64 个字符")
			return
		}
		cleanToken, err := cloudsync.ValidateTokenFormat(req.APIToken)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_provider_token", "请输入有效的 Cloudflare 只读 API 令牌")
			return
		}
		if cfClient == nil {
			writeError(w, http.StatusServiceUnavailable, "provider_unavailable", "Cloudflare 同步组件不可用")
			return
		}

		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Now().Add(3 * time.Minute))

		ver, err := cfClient.Verify(r.Context(), cleanToken)
		if err != nil {
			if errors.Is(err, cloudsync.ErrInvalidToken) {
				writeError(w, http.StatusBadRequest, "invalid_provider_token", "Cloudflare API 令牌验证失败，请确认令牌未过期且具备 Zone / DNS 只读权限")
				return
			}
			writeError(w, http.StatusBadGateway, "provider_unavailable", "连接 Cloudflare API 失败，请检查服务器外网连通性")
			return
		}

		conn, err := store.CreateCloudflareConnection(r.Context(), cleanLabel, req.AccountID, cleanToken, ver)
		if errors.Is(err, storage.ErrInvalidLink) {
			writeError(w, http.StatusBadRequest, "invalid_link", "所选归属账号不存在")
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}

		syncNow := req.SyncNow == nil || *req.SyncNow
		var stats *storage.SyncStats
		if syncNow {
			syncCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
			defer cancel()
			syncedConn, syncedStats, syncErr := runCloudflareSync(syncCtx, store, cfClient, lookuper, conn)
			conn = syncedConn
			if syncErr == nil {
				stats = &syncedStats
			}
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"connection": providerConnectionDTO(conn),
			"syncStats":  stats,
		})
	})

	api.Post("/integrations/{id}/sync", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		conn, err := store.GetProviderConnection(r.Context(), id)
		if err != nil {
			resourceError(w, err)
			return
		}
		if conn.Provider != "cloudflare" || cfClient == nil {
			writeError(w, http.StatusBadRequest, "invalid_integration", "不支持的同步提供商")
			return
		}

		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Now().Add(3 * time.Minute))

		syncCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
		defer cancel()

		updatedConn, stats, syncErr := runCloudflareSync(syncCtx, store, cfClient, lookuper, conn)
		if syncErr != nil {
			if errors.Is(syncErr, cloudsync.ErrInvalidToken) {
				writeError(w, http.StatusBadRequest, "invalid_provider_token", "Cloudflare API 令牌已失效或被撤销，请重新生成")
				return
			}
			writeError(w, http.StatusBadGateway, "provider_sync_failed", "Cloudflare 同步失败："+syncErr.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"connection": providerConnectionDTO(updatedConn),
			"syncStats":  stats,
		})
	})

	api.Delete("/integrations/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteProviderConnection(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	})
}
