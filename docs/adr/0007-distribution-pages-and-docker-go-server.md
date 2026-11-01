# 0007. Distribute as a static site on GitHub Pages and a Docker image with the Go server

- Status: Accepted
- Date: 2026-10-30
- Supersedes: [0003](0003-distribution-github-pages-and-docker.md)
- Amended: 2026-10-30 — repo name `yodo/app` → `yodo` ([0012](0012-monorepo.md)); container listen address clarified; linked 0012

## Context
[0003](0003-distribution-github-pages-and-docker.md) shipped the Docker image as nginx serving static files. [0006](0006-self-hosted-storage-go-sqlite.md) adds a Go server that stores data on disk, so the image must run that server instead.

## Decision
One CI pipeline builds the frontend once (`dist/`) and publishes it two ways:
- **GitHub Pages** at `sonaszjojka.github.io/yodo/` (hosted mode, IndexedDB).
- **Docker image** on GitHub Container Registry (`ghcr.io/sonaszjojka/yodo`): multi-stage build (Node builds the frontend, Go builds the server), final image contains the Go binary with `dist/` embedded. Run with:
  `docker run -p 127.0.0.1:8080:8080 -v yodo-data:/data ghcr.io/sonaszjojka/yodo`

Inside the container the server listens on `0.0.0.0:8080` (required for Docker port publishing); restricting access to the host machine is done by publishing on `127.0.0.1`, not by the server's listen address.

The frontend uses Vite `base: './'` and hash routing so it works under `/yodo/` and `/`.

## Alternatives considered
- **nginx-only image** (0003) — cannot persist data outside the browser.
- **Cloudflare Pages** — SPA fallback and root URL, but one more account; easy to switch later.
- **Docker only / Pages only** — loses either instant try-out or durable self-hosting.

## Consequences
- The `yodo` repo must be public (free Pages).
- Hash URLs (`/#/d/<id>`) instead of clean paths.
- Hosted and self-hosted instances are separate origins with separate data; moving drawings uses Yodo-file export / import.
- All of the owner's GitHub Pages projects share one origin, so IndexedDB names are prefixed `yodo-`.
- Frontend and backend ship in one image, which favours keeping them in one repository ([0012](0012-monorepo.md)).
