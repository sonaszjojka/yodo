# 0003. Distribute as a static site on GitHub Pages and as a Docker image

- Status: Superseded by [0007](0007-distribution-pages-and-docker-go-server.md)
- Date: 2026-10-30

## Context
`docs/product.md` requires Yodo to be easy for others to use and to self-host. In the MVP the app is fully static: drawings live in the browser, there is no backend.

## Decision
One CI build (`npm run build` → `dist/`) is published two ways:
- **GitHub Pages** at `sonaszjojka.github.io/yodo/`, deployed by GitHub Actions.
- **Docker image** (multi-stage: Node build → `nginx:alpine` serving `dist/`), pushed to GitHub Container Registry (`ghcr.io/sonaszjojka/yodo`).

To work under both `/yodo/` and `/`, the app uses Vite `base: './'` and **hash routing** (Pages has no SPA fallback). When the Go API arrives, the Go server replaces nginx and serves both the frontend and the API from one image.

## Alternatives considered
- **Cloudflare Pages** — SPA fallback and a root URL, but one more account; easy to switch to later since the build output is identical.
- **Docker only** — higher barrier for people who just want to try it.
- **Pages only** — no self-hosting path.

## Consequences
- The `yodo/app` repo must be public (free Pages).
- Hash URLs (`/#/d/<id>`) instead of clean paths.
- Pages and the Docker copy are different origins and do not share drawings.
- Until the API exists, the Docker version still stores data in the browser, not in the container.
- All GitHub Pages projects of the owner share one origin, so IndexedDB names must be prefixed (`yodo-*`).
