# 0009. Use the Go standard library `net/http` for the HTTP server

- Status: Accepted
- Date: 2026-10-30

## Context
The self-hosted Go server ([0006](0006-self-hosted-storage-go-sqlite.md)) serves the embedded frontend and a small JSON API (~15 endpoints). It needs routing with methods and path parameters plus a few middleware: logging, panic recovery, and the `Origin`/`Host` check from [0008](0008-auth-none-hosted-optional-password-self-hosted.md). The owner is learning Go.

## Decision
Use `net/http` from the standard library with `http.ServeMux` (method and path-parameter routing, Go 1.22+). Middleware are plain `func(http.Handler) http.Handler` wrappers written in the project. Logging uses the standard `log/slog`.

## Alternatives considered
- **Chi** — thin and stdlib-compatible with ready middleware, but mostly redundant since Go 1.22. Easy to add later because handlers keep the standard signature.
- **Gin / Echo** — feature-rich, but their own context types couple handlers to the framework and teach framework habits rather than idiomatic Go.

## Consequences
- No third-party HTTP dependency to update or audit.
- A few small middleware must be written and tested in the project.
- Handlers use standard types, so any stdlib-compatible library can be added later without rewrites.
