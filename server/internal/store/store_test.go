package store

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/sonaszjojka/yodo/server/migrations"
)

func TestOpenAppliesMigrationsAndPragmas(t *testing.T) {
	path := filepath.Join(t.TempDir(), "yodo.db")
	ctx := context.Background()

	sqlDB, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, "SELECT id FROM drawings"); err != nil {
		t.Errorf("drawings table missing: %v", err)
	}
	pragmas := []struct{ name, want string }{
		{"journal_mode", "wal"},
		{"busy_timeout", "5000"},
		{"foreign_keys", "1"},
	}
	for _, p := range pragmas {
		var got string
		if err := sqlDB.QueryRowContext(ctx, "PRAGMA "+p.name).Scan(&got); err != nil {
			t.Fatalf("PRAGMA %s: %v", p.name, err)
		}
		if got != p.want {
			t.Errorf("PRAGMA %s = %q, want %q", p.name, got, p.want)
		}
	}
	if _, err := sqlDB.ExecContext(ctx,
		"INSERT INTO drawings (id, name, schema_version, document, created_at, updated_at) VALUES ('a', 'A', 1, '{}', 1, 1)"); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}

	// Reopening an up-to-date database applies nothing and keeps the data.
	sqlDB, err = Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()
	var n int
	if err := sqlDB.QueryRowContext(ctx, "SELECT count(*) FROM drawings").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("drawings after reopen = %d, want 1", n)
	}
}

// A database that can't be opened must stop startup (ADR 0010).
func TestOpenFailsOnUnusablePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing-dir", "yodo.db")
	if sqlDB, err := Open(context.Background(), path); err == nil {
		_ = sqlDB.Close()
		t.Fatal("Open succeeded, want an error")
	}
}

// The path goes into a file: URI, so URI characters must not cut it short.
func TestOpenEscapesPath(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "my drawings ?#%")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "yodo.db")
	sqlDB, err := Open(context.Background(), path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = sqlDB.Close()
	if _, err := os.Stat(path); err != nil {
		t.Errorf("database not created at %q: %v", path, err)
	}
}

// A database created before folders (migration 1 only) keeps its drawings,
// outside any folder, when the server upgrades it (ADR 0045).
func TestOpenUpgradesADatabaseWithDrawings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "yodo.db")
	ctx := context.Background()

	old, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, old, migrations.FS)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 1); err != nil {
		t.Fatalf("migrate to 1: %v", err)
	}
	if _, err := old.ExecContext(ctx,
		"INSERT INTO drawings VALUES ('a', 'A', 1, '{}', 10, 20)"); err != nil {
		t.Fatal(err)
	}
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}

	sqlDB, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()
	var name string
	var created, updated int64
	var folder sql.NullString
	if err := sqlDB.QueryRowContext(ctx,
		"SELECT name, created_at, updated_at, folder_id FROM drawings WHERE id = 'a'").
		Scan(&name, &created, &updated, &folder); err != nil {
		t.Fatalf("select: %v", err)
	}
	if name != "A" || created != 10 || updated != 20 || folder.Valid {
		t.Errorf("got %q %d %d %+v, want A 10 20 and no folder", name, created, updated, folder)
	}
}
