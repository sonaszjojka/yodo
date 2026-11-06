// Package server builds the HTTP handler of the self-hosted Yodo server
// (ADR 0006, 0009): the embedded web app plus the JSON API under /api/.
package server

import (
	"database/sql"
	"io/fs"
	"net/http"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/db"
)

// New returns the root handler. static holds the built web app (index.html at
// its root). allowedOrigins guard every route against CSRF and DNS rebinding
// (ADR 0020). sqlDB is the drawings store (ADR 0030); folder deletes need its transactions (ADR 0046). imagesDir holds the image blobs (ADR 0040).
// auth is the optional password (ADR 0020); nil means none. The app uses hash routing (ADR 0007), so every page is served
// by index.html at / and no SPA fallback is needed: unknown paths are 404.
func New(static fs.FS, allowedOrigins AllowedOrigins, sqlDB *sql.DB, imagesDir string, auth *Auth) http.Handler {
	return newHandler(static, allowedOrigins, sqlDB, imagesDir, auth, time.Now)
}

// newHandler is New with an injected clock, for tests.
func newHandler(static fs.FS, allowedOrigins AllowedOrigins, sqlDB *sql.DB, imagesDir string, auth *Auth, now func() time.Time) http.Handler {
	queries := db.New(sqlDB)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	drawingsAPI{queries: queries, now: now}.register(mux)
	foldersAPI{queries: queries, sqlDB: sqlDB, now: now}.register(mux)
	// Behind a password, image bytes must not be kept by shared caches.
	imagesAPI{dir: imagesDir, private: auth.Enabled()}.register(mux)
	if auth != nil {
		auth.register(mux)
	}

	if _, err := fs.Stat(static, "index.html"); err != nil {
		// A Go build without the copied web/dist (ADR 0019).
		mux.HandleFunc("GET /", func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "frontend not built: see README", http.StatusServiceUnavailable)
		})
	} else {
		mux.Handle("GET /", http.FileServerFS(static))
	}
	var inner http.Handler = mux
	if auth != nil {
		inner = auth.requireSession(mux)
	}
	return requireAllowedOrigin(allowedOrigins, inner)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}` + "\n"))
}
