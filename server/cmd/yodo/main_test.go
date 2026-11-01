package main

import (
	"context"
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
