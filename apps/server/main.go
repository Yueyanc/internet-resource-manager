package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/auth"
	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/webui"
)

var version = "0.1.0-dev"

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	migrateOnly := flag.Bool("migrate-only", false, "apply database migrations and exit")
	healthcheck := flag.Bool("healthcheck", false, "probe local health endpoint and exit")
	flag.Parse()

	addr := env("IRM_LISTEN_ADDR", "127.0.0.1:8787")
	if *healthcheck {
		return runHealthcheck(addr)
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	allowedOrigins, err := server.ParseAllowedOrigins(os.Getenv("IRM_ALLOWED_ORIGINS"))
	if err != nil {
		return err
	}
	trustProxy := envBool("IRM_TRUST_PROXY")
	appVersion := env("IRM_VERSION", version)

	store, err := storage.Open(ctx, filepath.Join(env("IRM_DATA_DIR", "data"), "irm.db"))
	if err != nil {
		return err
	}
	defer store.Close()

	if err := bootstrapAdmin(ctx, store); err != nil {
		return err
	}
	if *migrateOnly {
		slog.Info("database migrations applied")
		return nil
	}

	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	if len(allowedOrigins) == 0 {
		if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			slog.Warn("public deployment is not supported without IRM_ALLOWED_ORIGINS; keep this listener private", "address", addr)
		}
	}

	opts := []server.Option{
		server.WithAllowedOrigins(allowedOrigins),
		server.WithTrustedProxy(trustProxy),
		server.WithVersion(appVersion),
	}
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.NewHandler(store, webui.Handler(), opts...),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	errorsCh := make(chan error, 2)
	go func() { errorsCh <- httpServer.ListenAndServe() }()
	slog.Info("server starting", "address", addr, "version", appVersion, "allowedOrigins", allowedOrigins, "trustProxy", trustProxy)

	var agentServer *http.Server
	if agentAddr := env("IRM_AGENT_LISTEN_ADDR", ""); agentAddr != "" {
		if _, _, err := net.SplitHostPort(agentAddr); err != nil {
			return err
		}
		agentServer = &http.Server{
			Addr:              agentAddr,
			Handler:           server.NewAgentHandler(store, opts...),
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      30 * time.Second,
			IdleTimeout:       60 * time.Second,
			BaseContext:       func(net.Listener) context.Context { return ctx },
		}
		go func() { errorsCh <- agentServer.ListenAndServe() }()
		slog.Info("agent ingest listener starting", "address", agentAddr)
	}

	select {
	case err := <-errorsCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if agentServer != nil {
			_ = agentServer.Shutdown(shutdownCtx)
		}
		return httpServer.Shutdown(shutdownCtx)
	}
}

func bootstrapAdmin(ctx context.Context, store *storage.Store) error {
	username := strings.TrimSpace(os.Getenv("IRM_ADMIN_USER"))
	password := os.Getenv("IRM_ADMIN_PASSWORD")
	if username == "" && password == "" {
		return nil
	}
	if username == "" || password == "" {
		return errors.New("IRM_ADMIN_USER and IRM_ADMIN_PASSWORD must be provided together")
	}
	if err := server.ValidateCredentials(username, password); err != nil {
		return fmt.Errorf("invalid bootstrap admin credentials: %w", err)
	}
	created, err := store.BootstrapAdministrator(ctx, username, auth.HashPassword(password))
	if err != nil {
		return err
	}
	if created {
		slog.Info("bootstrap administrator created", "username", username)
	} else {
		slog.Info("administrator already initialized; skipping bootstrap")
	}
	return nil
}

func runHealthcheck(listenAddr string) error {
	_, port, err := net.SplitHostPort(listenAddr)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/api/v1/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected health status %d", resp.StatusCode)
	}
	return nil
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func envBool(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
