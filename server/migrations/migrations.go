// Package migrations embeds the goose migrations (ADR 0010). sqlc reads the
// same .sql files as its schema (sqlc.yaml).
package migrations

import "embed"

// FS holds every migration file.
//
//go:embed *.sql
var FS embed.FS
