package server

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/domain"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type domainResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"createdAt"`
}

func domainDTO(value queries.Domain) domainResponse {
	return domainResponse{ID: value.ID, Name: value.Name, Notes: value.Notes, CreatedAt: value.CreatedAt}
}

func NewHandler(store *storage.Store, frontend http.Handler) http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID, middleware.Recoverer)
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Until authentication exists, reject non-loopback Host headers, including DNS rebinding.
			host := r.Host
			if name, _, err := net.SplitHostPort(host); err == nil {
				host = name
			}
			host = strings.Trim(strings.ToLower(host), "[]")
			if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
				writeError(w, http.StatusForbidden, "local_only", "当前版本仅允许本机访问")
				return
			}
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "same-origin")
			w.Header().Set("X-Frame-Options", "DENY")
			next.ServeHTTP(w, r)
		})
	})
	router.Route("/api/v1", func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Cache-Control", "no-store")
				next.ServeHTTP(w, r)
			})
		})
		api.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			if err := store.Ping(r.Context()); err != nil {
				writeError(w, http.StatusServiceUnavailable, "unavailable", "数据库不可用")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"status": "ok", "database": "ok", "version": "0.1.0-dev",
				"capabilities": map[string]bool{"auth": false, "domainLookup": false, "agentIngest": false},
			})
		})
		api.Get("/domains", func(w http.ResponseWriter, r *http.Request) {
			domains, err := store.ListDomains(r.Context())
			if err != nil {
				internalError(w, err)
				return
			}
			items := make([]domainResponse, 0, len(domains))
			for _, value := range domains {
				items = append(items, domainDTO(value))
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": items})
		})
		api.Post("/domains", func(w http.ResponseWriter, r *http.Request) {
			if contentType := strings.Split(r.Header.Get("Content-Type"), ";")[0]; contentType != "application/json" {
				writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "请使用 JSON 请求")
				return
			}
			var input struct {
				Name  string `json:"name"`
				Notes string `json:"notes"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_body", "请求数据格式不正确")
				return
			}
			if err := decoder.Decode(new(any)); err != io.EOF {
				writeError(w, http.StatusBadRequest, "invalid_body", "请求只能包含一个 JSON 对象")
				return
			}
			name, err := domain.NormalizeName(input.Name)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid_domain", "请输入有效域名，不包含协议、路径或端口")
				return
			}
			notes := strings.TrimSpace(input.Notes)
			if utf8.RuneCountInString(notes) > 2000 {
				writeError(w, http.StatusBadRequest, "invalid_notes", "备注不能超过 2000 个字符")
				return
			}
			value, err := store.CreateDomain(r.Context(), name, notes)
			if errors.Is(err, storage.ErrExists) {
				writeError(w, http.StatusConflict, "already_exists", "该域名已存在")
				return
			}
			if err != nil {
				internalError(w, err)
				return
			}
			writeJSON(w, http.StatusCreated, domainDTO(value))
		})
		api.Delete("/domains/{id}", func(w http.ResponseWriter, r *http.Request) {
			err := store.DeleteDomain(r.Context(), chi.URLParam(r, "id"))
			if errors.Is(err, storage.ErrNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "域名不存在")
				return
			}
			if err != nil {
				internalError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
		})
	})
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || frontend == nil {
			writeError(w, http.StatusNotFound, "not_found", "接口不存在")
			return
		}
		frontend.ServeHTTP(w, r)
	})
	return http.NewCrossOriginProtection().Handler(router)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func internalError(w http.ResponseWriter, err error) {
	slog.Error("database request failed", "error", err)
	writeError(w, http.StatusInternalServerError, "internal_error", "数据操作失败，请稍后重试")
}
