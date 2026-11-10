# 0063. An optional API token for non-browser clients; a valid token lifts the `Origin`-required rule and the password session

- Status: Accepted
- Date: 2026-11-10

## Context
Roadmap 5.2: "Optional `YODO_API_TOKEN`: `Authorization: Bearer <token>` is accepted without `Origin` or a password session; the `Host` check is unchanged; constant-time compare; an invalid value stops startup." The MCP server (ADR [0061](0061-mcp-server-as-a-typescript-package-in-mcp.md)) talks to a self-hosted server through `HttpDrawingRepository`. It is not a browser, so it sends no `Origin` and has no session cookie.

[0020](0020-auth-and-origin-checks.md) requires an allowed `Origin` on every method other than `GET`/`HEAD`, and a session cookie on `/api/*` when `YODO_PASSWORD` is set. These rules defend against *browsers* being used cross-site (CSRF, cross-site WebSocket hijacking, DNS rebinding). A non-browser client can forge `Origin`, so the `Origin` rule never kept it out. What it lacks is a documented way in, and a way past the password without driving the login form.

## Decision
Extend 0020 with an optional static bearer token:
- **`YODO_API_TOKEN`**, unset by default. When it is set, it must be at least 32 characters from the RFC 6750 `token68` set (`A–Z a–z 0–9 - . _ ~ + /`, optionally ending in `=`). Any other value stops startup, as an invalid `YODO_ALLOWED_ORIGINS` does. `openssl rand -hex 32` makes a good one.
- **A request with a valid `Authorization: Bearer <token>`** to `/api/*` doesn't need an `Origin` header, and doesn't need a session when `YODO_PASSWORD` is set.
- **Unchanged for token requests:** the `Host` header must still match an allowed origin, and an `Origin` header that *is* present must still be allowed. A browser always sends `Origin` cross-site, so a leaked token can't be used from a hostile page.
- **When a token is configured, a wrong or empty bearer** gets `401` with `WWW-Authenticate: Bearer`. The server doesn't fall back to the cookie, so a broken client fails loudly. The scheme name is case-insensitive (RFC 7235).
- **Other `Authorization` headers are ignored:** another scheme (such as `Basic` from a reverse proxy), or any `Authorization` header when no token is configured, leaves the request to the 0020 rules exactly as before.
- **Comparison:** both values are hashed with SHA-256 and compared with `subtle.ConstantTimeCompare`, the same as the password, so neither the value nor its length leaks through timing.
- One token per server, and no throttle: a 32-character random token can't be guessed online.

## Alternatives considered
- **A valid token bypasses every `Origin` check** — the literal reading, and slightly simpler. A token pasted into a hostile page's script would then work from a browser. Keeping the check on a present `Origin` costs one condition.
- **Tokens in the database, created and revoked in the UI** — the long-term design (like personal access tokens), with several tokens and revocation. It needs a migration, an API and UI, which is too much for one local agent. It can replace this later.
- **The MCP server logs in with `YODO_PASSWORD` and keeps the cookie** — the agent would need the user's password, and it would still need to fake `Origin`.
- **Fall back to the session when the bearer is wrong** — hides misconfigured clients behind a confusing `403`/`401` from another check.

## Consequences
- The MCP server (5.3) authenticates with `YODO_URL` plus `YODO_API_TOKEN`, with or without `YODO_PASSWORD`.
- The token has the same rights as a logged-in user. Anyone who can read the server's environment or the agent's config can use it. The README says to keep it out of shared config.
- Rotating the token means a restart with a new value. There is no revocation without a restart.
- `Authorization` and `Origin` checking now interact; both get table-driven tests.
