// Command yodo is the self-hosted Yodo server (ADR 0006, 0007): it serves the
// embedded web app and the JSON API.
//
// Environment:
//
//	YODO_ADDR  listen address, default 127.0.0.1:8080 (the Docker image sets
//	           0.0.0.0:8080, ADR 0019)
//	YODO_ALLOWED_ORIGINS  comma-separated origins the server accepts requests
//	           for, default http://localhost:8080,http://127.0.0.1:8080 (ADR 0020)
//	YODO_DATA_DIR  directory for the SQLite database yodo.db, created if
//	           missing, default ./data (the Docker image sets /data, ADR 0030)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/db"
	"github.com/sonaszjojka/yodo/server/internal/server"
	"github.com/sonaszjojka/yodo/server/internal/store"
	"github.com/sonaszjojka/yodo/server/internal/webui"
)

const (
	defaultAddr    = "127.0.0.1:8080"
	defaultDataDir = "data"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Getenv); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

// run serves until ctx is cancelled (SIGINT/SIGTERM, e.g. `docker stop`),
// then shuts down gracefully.
func run(ctx context.Context, getenv func(string) string) error {
	addr := getenv("YODO_ADDR")
	if addr == "" {
		addr = defaultAddr
	}

	// Fail fast on a typo instead of blocking every request later.
	originsEnv := getenv("YODO_ALLOWED_ORIGINS")
	origins, err := server.ParseAllowedOrigins(originsEnv)
	if err != nil {
		return err
	}
	if _, port, _ := net.SplitHostPort(addr); originsEnv == "" && port != "8080" {
		slog.Warn("the default allowed origins use port 8080, so requests on another port get 403; set YODO_ALLOWED_ORIGINS",
			"addr", addr)
	}

	dataDir := getenv("YODO_DATA_DIR")
	if dataDir == "" {
		dataDir = defaultDataDir
	}
	// Migrations run here, before listening, so a broken database stops
	// startup instead of failing requests later (ADR 0010).
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return fmt.Errorf("YODO_DATA_DIR: %w", err)
	}
	// WithoutCancel: a signal during startup must not interrupt a migration;
	// run sees the cancelled ctx right after and shuts down.
	sqlDB, err := store.Open(context.WithoutCancel(ctx), filepath.Join(dataDir, "yodo.db"))
	if err != nil {
		return fmt.Errorf("YODO_DATA_DIR: %w", err)
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			slog.Error("closing database", "err", err)
		}
	}()

	srv := &http.Server{
		Addr:    addr,
		Handler: server.New(webui.FS(), origins, db.New(sqlDB)),
		// Bounds slow clients that never finish their headers (Slowloris).
		ReadHeaderTimeout: 10 * time.Second,
	}

	errc := make(chan error, 1)
	go func() {
		slog.Info("yodo server listening", "addr", addr, "allowed_origins", origins.List(), "data_dir", dataDir)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
