# 0008. No auth in hosted mode; localhost-only with an optional password when self-hosted

- Status: Superseded by [0020](0020-auth-and-origin-checks.md)
- Date: 2026-10-30
- Amended: 2026-10-30 — configurable allowed origins and the rule for requests without an `Origin` header

## Context
`docs/product.md` forbids requiring an account to draw. Hosted mode has no server, so there is nothing a login could protect. The self-hosted server ([0006](0006-self-hosted-storage-go-sqlite.md)) holds the user's data and may be run on a laptop or on a home server / LAN.

## Decision
- **Hosted (GitHub Pages):** no authentication.
- **Self-hosted, default:** no login. The documented run command publishes the port on `127.0.0.1` only.
- **Self-hosted, always:** the server only accepts requests addressed to an allowed origin, preventing other websites from calling the local API (CSRF, DNS rebinding):
  - Allowed origins come from `YODO_ALLOWED_ORIGINS` (comma-separated, e.g. `http://yodo.home:8080`), defaulting to `http://localhost:8080` and `http://127.0.0.1:8080`.
  - Every request: the `Host` header must match an allowed origin.
  - State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`): the `Origin` header must be present and match an allowed origin. Safe methods (`GET`, `HEAD`) may omit `Origin`, since browsers often do for same-origin requests.
- **Self-hosted, optional:** if `YODO_PASSWORD` is set, the server requires that password and keeps a server-side session in an `httpOnly`, `SameSite` cookie.
- Full user accounts are deferred to the multi-user server.

## Alternatives considered
- **Login on GitHub Pages** — client-side only, trivially bypassed; real auth would need a backend.
- **Full accounts in the self-hosted MVP** — sign-up and password reset without email is awkward; friction for a single user.
- **JWT instead of sessions** — hard to revoke and often stored where XSS can reach it; no benefit for one server.

## Consequences
- Zero-friction start in both modes.
- Anyone with access to the machine (or the LAN, if exposed without a password) can see the drawings.
- `Origin`/`Host` checking is a security requirement with its own tests.
- Running on a LAN or home server requires setting `YODO_ALLOWED_ORIGINS` (documented in the README next to `YODO_PASSWORD`).
- The session code for `YODO_PASSWORD` can grow into multi-user accounts later.
