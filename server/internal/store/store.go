// Package store opens the self-hosted SQLite database (ADR 0006, 0010).
package store

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"path/filepath"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite" // registers the "sqlite" driver

	"github.com/sonaszjojka/yodo/server/migrations"
)

// pragmas run on every new connection (ADR 0010): WAL lets reads continue
// during a write, busy_timeout waits for a lock instead of failing at once.
var pragmas = []string{"journal_mode(WAL)", "busy_timeout(5000)", "foreign_keys(1)"}

// Open opens the database file at path, creating it if needed, and applies
// every pending migration. It fails if the file can't be opened or a
// migration fails, so the server never runs on a half-migrated database.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	q := url.Values{"_pragma": pragmas}
	// A file: URI, so characters such as '?' or '#' in the path are escaped.
	dsn := (&url.URL{Scheme: "file", Path: filepath.ToSlash(abs), RawQuery: q.Encode()}).String()

	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := migrate(ctx, sqlDB); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("database %s: %w", path, err)
	}
	return sqlDB, nil
}

func migrate(ctx context.Context, sqlDB *sql.DB) error {
	provider, err := goose.NewProvider(goose.DialectSQLite3, sqlDB, migrations.FS)
	if err != nil {
		return err
	}
	_, err = provider.Up(ctx)
	return err
}
