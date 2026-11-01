# 0020. No auth in hosted mode; localhost-only with an optional password when self-hosted; check `Origin` whenever present

- Status: Accepted
- Date: 2026-11-01

## Context
Supersedes [0008](0008-auth-none-hosted-optional-password-self-hosted.md), which only checked `Origin` on `POST`, `PUT`, `PATCH` and `DELETE`. Implementing it (roadmap 0.5) showed two gaps: a `GET`/`HEAD` that carries a foreign `Origin` was let through, so a cross-site WebSocket upgrade (always a `GET`) or any `GET` with side effects would be reachable from another site; and methods outside the list (`OPTIONS`, custom verbs) were left undefined.

`docs/product.md` forbids requiring an account to draw. Hosted mode has no server, so there is nothing a login could protect. The self-hosted server ([0006](0006-self-hosted-storage-go-sqlite.md)) holds the user's data and may be run on a laptop or on a home server / LAN.

## Decision
- **Hosted (GitHub Pages):** no authentication.
- **Self-hosted, default:** no login. The documented run command publishes the port on `127.0.0.1` only.
- **Self-hosted, always:** the server only accepts requests addressed to and sent from an allowed origin, preventing other websites from calling the local API (CSRF, cross-site WebSocket hijacking, DNS rebinding):
  - Allowed origins come from `YODO_ALLOWED_ORIGINS` (comma-separated, e.g. `http://yodo.home:8080`), defaulting to `http://localhost:8080` and `http://127.0.0.1:8080`. An invalid value stops startup.
  - Every request: the `Host` header must match an allowed origin.
  - Every request that carries an `Origin` header, whatever the method: it must match an allowed origin.
  - Every method other than `GET` and `HEAD` (deny by default): the `Origin` header must be present. Only `GET`/`HEAD` may omit it, since browsers often do for same-origin requests.
- **Self-hosted, optional:** if `YODO_PASSWORD` is set, the server requires that password and keeps a server-side session in an `httpOnly`, `SameSite` cookie.
- Full user accounts are deferred to the multi-user server.

## Alternatives considered
- **Keep 0008's rule (check `Origin` only on the listed methods)** — leaves `GET`-based WebSocket upgrades and future side-effecting `GET`s open cross-site; every such route would need its own check.
- **Go 1.25 `http.CrossOriginProtection`** — relies on `Sec-Fetch-Site` and skips safe methods, so it doesn't cover WebSocket upgrades or the `Host` check against DNS rebinding; our own middleware is small and already tested.
- **Login on GitHub Pages** — client-side only, trivially bypassed; real auth would need a backend.
- **Full accounts in the self-hosted MVP** — sign-up and password reset without email is awkward; friction for a single user.
- **JWT instead of sessions** — hard to revoke and often stored where XSS can reach it; no benefit for one server.

## Consequences
- Zero-friction start in both modes.
- Anyone with access to the machine (or the LAN, if exposed without a password) can see the drawings.
- `Origin`/`Host` checking is a security requirement with its own tests.
- A future WebSocket endpoint is covered by the middleware without extra code.
- Running on a LAN or home server, or publishing the Docker port on another number, requires setting `YODO_ALLOWED_ORIGINS` (documented in the README next to `YODO_PASSWORD`).
- The session code for `YODO_PASSWORD` can grow into multi-user accounts later.
