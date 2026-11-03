package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A typo in YODO_ALLOWED_ORIGINS must stop startup, not start a server that
// answers 403 to everything (ADR 0020).
func TestRunRejectsBadAllowedOrigins(t *testing.T) {
	env := map[string]string{
		"YODO_ADDR":            "127.0.0.1:0",
		"YODO_ALLOWED_ORIGINS": "yodo.home:8080",
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // if run got past validation, it would shut down right away
	err := run(ctx, func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "YODO_ALLOWED_ORIGINS") {
		t.Fatalf("err = %v, want a YODO_ALLOWED_ORIGINS error", err)
	}
}

// An unusable data directory must stop startup before the server listens
// (ADR 0010).
func TestRunRejectsUnusableDataDir(t *testing.T) {
	file := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{"YODO_ADDR": "127.0.0.1:0", "YODO_DATA_DIR": file}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := run(ctx, func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "YODO_DATA_DIR") {
		t.Fatalf("err = %v, want a YODO_DATA_DIR error", err)
	}
}

// With a usable data directory, run creates and migrates the database, then
// shuts down cleanly when ctx is cancelled.
func TestRunCreatesDatabase(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "data")
	env := map[string]string{"YODO_ADDR": "127.0.0.1:0", "YODO_DATA_DIR": dir}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := run(ctx, func(k string) string { return env[k] }); err != nil {
		t.Fatalf("run: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "yodo.db")); err != nil {
		t.Errorf("database not created: %v", err)
	}
}
