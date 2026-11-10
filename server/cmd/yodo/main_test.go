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

// YODO_PASSWORD must reach the server: the process starts fine with it set.
func TestRunAcceptsPassword(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "data")
	env := map[string]string{"YODO_ADDR": "127.0.0.1:0", "YODO_DATA_DIR": dir, "YODO_PASSWORD": "secret"}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := run(ctx, func(k string) string { return env[k] }); err != nil {
		t.Fatalf("run: %v", err)
	}
}

// A weak or malformed YODO_API_TOKEN must stop startup, and the error must
// not echo the value (ADR 0063).
func TestRunRejectsBadAPIToken(t *testing.T) {
	const value = "too-short-token"
	env := map[string]string{"YODO_ADDR": "127.0.0.1:0", "YODO_DATA_DIR": t.TempDir(), "YODO_API_TOKEN": value}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := run(ctx, func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "YODO_API_TOKEN") {
		t.Fatalf("err = %v, want a YODO_API_TOKEN error", err)
	}
	if strings.Contains(err.Error(), value) {
		t.Errorf("error %q leaks the token value", err)
	}
}

func TestRunAcceptsAPIToken(t *testing.T) {
	env := map[string]string{
		"YODO_ADDR":      "127.0.0.1:0",
		"YODO_DATA_DIR":  filepath.Join(t.TempDir(), "data"),
		"YODO_API_TOKEN": "0123456789abcdef0123456789abcdef",
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := run(ctx, func(k string) string { return env[k] }); err != nil {
		t.Fatalf("run: %v", err)
	}
}
