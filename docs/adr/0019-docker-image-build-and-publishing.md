# 0019. Build the Docker image with the frontend copied into the Go package, on distroless, published multi-arch from `main`

- Status: Accepted
- Date: 2026-11-01

## Context
[0007](0007-distribution-pages-and-docker-go-server.md) ships a Docker image on GHCR whose Go binary embeds the built frontend (`dist/`). It leaves three choices open:
- `//go:embed` only reaches files inside the Go package's directory, so `server/` cannot embed `../web/dist` directly.
- The final image's base decides its size, attack surface and the user the server runs as.
- CI ([0018](0018-ci-github-actions-gate-job.md)) must build the image and decide when and for which CPU architectures to push it. The owner develops on an arm64 Mac, and most servers are amd64.

## Decision
- **Embedding:** the build copies `web/dist` into `server/internal/webui/dist/`, which is gitignored except for a committed `.gitkeep`, and the package embeds it with `//go:embed all:dist`. Go builds, tests and lint work without a frontend build. If `index.html` is missing, the server answers with a "frontend not built" message instead of failing.
- **Image:** a multi-stage `Dockerfile` at the repo root (the build context needs both `web/` and `server/`). A Node stage builds `dist/`, a Go stage builds a static binary (`CGO_ENABLED=0`, which works because modernc SQLite is pure Go), and the final stage is **`gcr.io/distroless/static-debian13:nonroot`**. All base images are pinned by tag and digest, the same supply-chain practice as pinning actions by SHA. `/data` is created owned by the non-root user, so a new named volume is writable.
- **Listen address:** `YODO_ADDR` sets it. The binary defaults to `127.0.0.1:8080`, which is safe when run directly on a machine. The image sets `0.0.0.0:8080`, as 0007 requires.
- **Publishing:** a `docker` job in `ci.yml`, behind the `ci` gate, runs when `web/`, `server/`, the `Dockerfile` or workflows change. On pull requests it only builds, which proves the Dockerfile works. On push to `main` it pushes `ghcr.io/sonaszjojka/yodo:latest` and `:sha-<short>` for `linux/amd64` and `linux/arm64`. The builder stages run on the native build platform and cross-compile Go (`GOARCH=$TARGETARCH`), so no QEMU emulation is needed. Version tags arrive with releases (v1.0.0).

## Alternatives considered
- **Build tag with an on-disk `dist/` in development**: lets the frontend change without rebuilding Go, but that means two code paths. Development uses the Vite dev server anyway.
- **Vite `outDir` inside `server/`**: no copy step, but it couples `web/` to the server layout and moves the Pages artifact away from `web/dist`.
- **`scratch` base**: smallest possible, but we would hand-roll the non-root user, CA certificates and `/data` ownership that distroless already provides.
- **`alpine` base**: has a shell for debugging, but more packages to patch and scan.
- **amd64-only image**: faster CI, but it runs under emulation on arm64 machines.
- **Push only on release tags**: no image to try before v1.0.0.

## Consequences
- The image is small and has no shell, so debugging happens through logs, or by running the binary outside Docker.
- A local `go build` serves the "frontend not built" message until `web/dist` is copied in. The Dockerfile is the reference build.
- GHCR creates the package as private on its first push. The owner makes it public once in the package settings. The `org.opencontainers.image.source` label links it to the repo.
- Base image digests and action SHAs are bumped by hand until Dependabot (`docker`, `github-actions`) is set up.
- Multi-arch builds make the `docker` job the slowest in CI. It runs only when its inputs change.
