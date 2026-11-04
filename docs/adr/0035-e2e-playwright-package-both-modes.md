# 0035. Run Playwright e2e tests from an `e2e/` package against both modes, served from one build

- Status: Accepted
- Date: 2026-11-04

## Context
Roadmap 1.16 needs a first end-to-end flow (draw → reload → open from Home) in hosted and self-hosted mode ([0011](0011-testing-strategy.md)). The two modes run the same build ([0007](0007-distribution-pages-and-docker-go-server.md)) and differ only in which `DrawingRepository` the health probe picks ([0031](0031-storage-mode-detection-and-server-contract-tests.md)). The repository layout reserves `e2e/` for these tests ([0012](0012-monorepo.md)). The Go server embeds the web build, so the build must be copied into `server/internal/webui/dist/` before `go build` ([0019](0019-docker-image-build-and-publishing.md)).

## Decision
**Package.** `e2e/` is its own npm package with `@playwright/test`, plus the same TypeScript, Prettier and oxlint versions as `web/`, so the definition of done (format, lint, type-check) applies there too.

**One build, two servers.** `npm test` runs `build:app` first. It builds `web/dist` once, copies it into `server/internal/webui/dist/` (gitignored, the same step as the Dockerfile) and builds the server binary into `e2e/.bin/`. Playwright's `webServer` then starts:
- **hosted:** `vite preview --base /yodo/` on `127.0.0.1:4180`. That's the Pages path, and its HTML fallback for `api/health` fails the probe, so the app picks IndexedDB.
- **self-hosted:** the built binary on `127.0.0.1:4181` with a temporary `YODO_DATA_DIR` and a matching `YODO_ALLOWED_ORIGINS`.

Existing servers are never reused, so a stray dev server can't stand in for the one under test.

**Projects.** {hosted, self-hosted} × {Chromium, Firefox, WebKit}: six projects. Every test also asserts where the drawing was stored, so a silent fallback to IndexedDB can't make the self-hosted run pass.

**CI.** An `e2e` job runs when `web/`, `server/` or `e2e/` changes, joins the `ci` gate's `needs` ([0018](0018-ci-github-actions-gate-job.md)), and uploads the HTML report when it fails.

## Alternatives considered
- **Run the Docker image.** It's the most faithful option, but slow, needs Docker locally, and repeats what the `docker` CI job already proves.
- **A server flag to serve `web/dist` from disk.** Simpler to start, but it adds production code only for tests and leaves the embed path untested.
- **Chromium only.** Faster CI, but the canvas, IndexedDB and pointer events are where engines differ, which is what e2e should catch.
- **Playwright inside `web/`.** It would reuse `node_modules`, but it goes against 0012's layout and mixes the Vitest and Playwright configs.
- **Run it locally only.** No CI cost, but nothing enforces it, the trap 0031 rejected.

## Consequences
- Running `npm test` in `e2e/` needs Node, Go and the Playwright browsers (`npx playwright install`, a few hundred MB).
- A third npm package with its own lockfile and dependency updates.
- CI gains its slowest job: one web build, one Go build and three browsers.
- More flows (roadmap 3.6) and visual tests add a spec file each; the servers and projects stay the same.
