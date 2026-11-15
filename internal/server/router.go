package server

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/updater"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Option func(*handlerConfig)

type handlerConfig struct {
	ipLookuper       ipaddr.Lookuper
	ipProber         ipaddr.Prober
	domainLookuper   domainname.Lookuper
	cloudflareClient cloudsync.CloudflareClient
	agentBinDir      string
	allowedOrigins   []string
	trustProxy       bool
	version          string
	buildType        string
	updaterSvc       *updater.Service
	restartFn        func()
}

func ParseAllowedOrigins(raw string) ([]string, error) {
	var out []string
	seen := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		u, err := url.Parse(part)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("invalid origin %q: expected scheme://host[:port]", part)
		}
		normalized := strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
		if _, exists := seen[normalized]; !exists {
			seen[normalized] = struct{}{}
			out = append(out, normalized)
		}
	}
	return out, nil
}

func WithIPServices(lookuper ipaddr.Lookuper, prober ipaddr.Prober) Option {
	return func(cfg *handlerConfig) {
		if lookuper != nil {
			cfg.ipLookuper = lookuper
		}
		if prober != nil {
			cfg.ipProber = prober
		}
	}
}

func WithDomainLookuper(lookuper domainname.Lookuper) Option {
	return func(cfg *handlerConfig) {
		if lookuper != nil {
			cfg.domainLookuper = lookuper
		}
	}
}

func WithCloudflareClient(client cloudsync.CloudflareClient) Option {
	return func(cfg *handlerConfig) {
		if client != nil {
			cfg.cloudflareClient = client
		}
	}
}

func WithAgentBinaryDir(dir string) Option {
	return func(cfg *handlerConfig) {
		cfg.agentBinDir = strings.TrimSpace(dir)
	}
}

func WithAllowedOrigins(origins []string) Option {
	return func(cfg *handlerConfig) {
		cfg.allowedOrigins = append([]string(nil), origins...)
	}
}

func WithTrustedProxy(trust bool) Option {
	return func(cfg *handlerConfig) {
		cfg.trustProxy = trust
	}
}

func WithVersion(version string) Option {
	return func(cfg *handlerConfig) {
		if trimmed := strings.TrimSpace(version); trimmed != "" {
			cfg.version = trimmed
		}
	}
}

func WithBuildType(buildType string) Option {
	return func(cfg *handlerConfig) {
		if trimmed := strings.TrimSpace(buildType); trimmed != "" {
			cfg.buildType = trimmed
		}
	}
}

func WithUpdater(svc *updater.Service) Option {
	return func(cfg *handlerConfig) {
		if svc != nil {
			cfg.updaterSvc = svc
		}
	}
}

func WithRestartFunc(fn func()) Option {
	return func(cfg *handlerConfig) {
		if fn != nil {
			cfg.restartFn = fn
		}
	}
}

func buildHandlerConfig(opts ...Option) handlerConfig {
	cfg := handlerConfig{
		ipLookuper:       ipaddr.NewDefaultLookuper(),
		ipProber:         ipaddr.NewDefaultProber(),
		domainLookuper:   domainname.NewDefaultLookuper(),
		cloudflareClient: cloudsync.NewCloudflareClient(),
		version:          "0.1.0-dev",
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	return cfg
}

// NewAgentHandler builds an HTTP handler serving only `/agent/v1/*` machine-token endpoints.
// Useful when binding a dedicated Tailscale/LAN ingest port via IRM_AGENT_LISTEN_ADDR while
// keeping the admin web UI strictly on 127.0.0.1.
func NewAgentHandler(store *storage.Store, opts ...Option) http.Handler {
	cfg := buildHandlerConfig(opts...)
	gateway := newAgentGateway(store, cfg.ipLookuper, cfg.agentBinDir, cfg.trustProxy)
	router := chi.NewRouter()
	router.Use(middleware.RequestID, middleware.Recoverer)
	router.Route("/agent/v1", gateway.routes)
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "接口不存在")
	})
	return router
}

func NewHandler(store *storage.Store, frontend http.Handler, opts ...Option) http.Handler {
	cfg := buildHandlerConfig(opts...)
	authentication := &authHandler{store: store, trustProxy: cfg.trustProxy}
	gateway := newAgentGateway(store, cfg.ipLookuper, cfg.agentBinDir, cfg.trustProxy)
	updaterSvc := cfg.updaterSvc
	if updaterSvc == nil {
		updaterSvc = updater.New(updater.Config{
			CurrentVersion: cfg.version,
			BuildType:      cfg.buildType,
			AgentBinDir:    cfg.agentBinDir,
			Store:          store,
		})
	}

	allowedHosts := make(map[string]struct{})
	cop := http.NewCrossOriginProtection()
	for _, origin := range cfg.allowedOrigins {
		u, err := url.Parse(origin)
		if err != nil || u.Hostname() == "" {
			continue
		}
		allowedHosts[strings.Trim(strings.ToLower(u.Hostname()), "[]")] = struct{}{}
		_ = cop.AddTrustedOrigin(strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host))
	}

	adminRouter := chi.NewRouter()
	adminRouter.Use(hostGuard(allowedHosts))
	adminRouter.Route("/api/v1", func(api chi.Router) {
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
				"status": "ok", "database": "ok", "version": cfg.version,
				"capabilities": map[string]bool{"auth": true, "domainLookup": true, "agentIngest": true, "selfUpdate": updaterSvc.CanSelfUpdate()},
			})
		})
		authentication.routes(api)
		api.Group(func(private chi.Router) {
			private.Use(authentication.require)
			domainRoutes(private, store, cfg.domainLookuper)
			integrationRoutes(private, store, cfg.cloudflareClient, cfg.domainLookuper)
			subscriptionRoutes(private, store)
			accountRoutes(private, store)
			vaultRoutes(private, store)
			ipRoutes(private, store, cfg.ipLookuper, cfg.ipProber)
			serverRoutes(private, store, cfg.ipLookuper)
			systemRoutes(private, updaterSvc, cfg.restartFn)
		})
	})
	adminRouter.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || frontend == nil {
			writeError(w, http.StatusNotFound, "not_found", "接口不存在")
			return
		}
		frontend.ServeHTTP(w, r)
	})
	protectedAdmin := cop.Handler(adminRouter)

	agentRouter := chi.NewRouter()
	gateway.routes(agentRouter)

	root := chi.NewRouter()
	root.Use(middleware.RequestID, middleware.Recoverer)
	root.Mount("/agent/v1", agentRouter)
	root.Mount("/", protectedAdmin)
	return root
}

func hostGuard(allowedHosts map[string]struct{}) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			host := r.Host
			if name, _, err := net.SplitHostPort(host); err == nil {
				host = name
			}
			host = strings.Trim(strings.ToLower(host), "[]")
			_, explicitlyAllowed := allowedHosts[host]
			ip := net.ParseIP(host)
			if !explicitlyAllowed && host != "localhost" && (ip == nil || !ip.IsLoopback()) {
				writeError(w, http.StatusForbidden, "local_only", "当前版本仅允许本机或已授权域名访问")
				return
			}
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "same-origin")
			w.Header().Set("X-Frame-Options", "DENY")
			next.ServeHTTP(w, r)
		})
	}
}
