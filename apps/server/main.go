package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/webui"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	migrateOnly := flag.Bool("migrate-only", false, "apply database migrations and exit")
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store, err := storage.Open(ctx, filepath.Join(env("IRM_DATA_DIR", "data"), "irm.db"))
	if err != nil {
		return err
	}
	defer store.Close()
	if *migrateOnly {
		slog.Info("database migrations applied")
		return nil
	}
	addr := env("IRM_LISTEN_ADDR", "127.0.0.1:8787")
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		slog.Warn("authentication is not implemented; keep this listener private", "address", addr)
	}
	httpServer := &http.Server{
		Addr: addr, Handler: server.NewHandler(store, webui.Handler()),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	errorsCh := make(chan error, 1)
	go func() { errorsCh <- httpServer.ListenAndServe() }()
	slog.Info("server starting", "address", addr, "authentication", false)
	select {
	case err := <-errorsCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	}
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
