// Command yodo is the self-hosted Yodo server (ADR 0006, 0007): it serves the
// embedded web app and the JSON API.
//
// Environment:
//
//	YODO_ADDR  listen address, default 127.0.0.1:8080 (the Docker image sets
//	           0.0.0.0:8080, ADR 0019)
//	YODO_ALLOWED_ORIGINS  comma-separated origins the server accepts requests
//	           for, default http://localhost:8080,http://127.0.0.1:8080 (ADR 0020)
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/server"
	"github.com/sonaszjojka/yodo/server/internal/webui"
)

const defaultAddr = "127.0.0.1:8080"

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

	srv := &http.Server{
		Addr:    addr,
		Handler: server.New(webui.FS(), origins),
		// Bounds slow clients that never finish their headers (Slowloris).
		ReadHeaderTimeout: 10 * time.Second,
	}

	errc := make(chan error, 1)
	go func() {
		slog.Info("yodo server listening", "addr", addr, "allowed_origins", origins.List())
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
