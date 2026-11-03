// Package server builds the HTTP handler of the self-hosted Yodo server
// (ADR 0006, 0009): the embedded web app plus the JSON API under /api/.
package server

import (
	"io/fs"
	"net/http"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/db"
)

// New returns the root handler. static holds the built web app (index.html at
// its root). allowedOrigins guard every route against CSRF and DNS rebinding
// (ADR 0020). queries is the drawings store (ADR 0030). The app uses hash routing (ADR 0007), so every page is served
// by index.html at / and no SPA fallback is needed: unknown paths are 404.
func New(static fs.FS, allowedOrigins AllowedOrigins, queries *db.Queries) http.Handler {
	return newHandler(static, allowedOrigins, queries, time.Now)
}

// newHandler is New with an injected clock, for tests.
func newHandler(static fs.FS, allowedOrigins AllowedOrigins, queries *db.Queries, now func() time.Time) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	drawingsAPI{queries: queries, now: now}.register(mux)

	if _, err := fs.Stat(static, "index.html"); err != nil {
		// A Go build without the copied web/dist (ADR 0019).
		mux.HandleFunc("GET /", func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "frontend not built: see README", http.StatusServiceUnavailable)
		})
	} else {
		mux.Handle("GET /", http.FileServerFS(static))
	}
	return requireAllowedOrigin(allowedOrigins, mux)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}` + "\n"))
}
