package main

import "testing"

// TestSmoke is a placeholder that proves `go test ./...` runs (roadmap 0.2).
// Remove it once the /api/health handler tests exist (roadmap 0.4).
func TestSmoke(t *testing.T) {
	if got := 1 + 1; got != 2 {
		t.Fatalf("1 + 1 = %d, want 2", got)
	}
}
