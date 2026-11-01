# 0012. Keep frontend, backend and docs in one repository

- Status: Accepted
- Date: 2026-10-30

## Context
The frontend and the Go server ship together in one Docker image ([0007](0007-distribution-pages-and-docker-go-server.md)), and API changes usually need matching frontend changes. There is one developer. The early plan assumed two repos, `yodo/app` and `yodo/api`.

## Decision
One public GitHub repository, `sonaszjojka/yodo`, laid out as:
```
yodo/
  web/        React + Vite app; src/core/ (framework-free engine), src/ui/ (React shell)
  server/     Go module: cmd/yodo, internal/…, migrations/, queries/
  e2e/        Playwright tests spanning both
  docs/       product.md, plan.md, adr/
  Dockerfile  multi-stage build of web + server
  .github/workflows/
```
CI uses path filters so frontend-only changes skip Go jobs and vice versa. No monorepo build tool.

[0007](0007-distribution-pages-and-docker-go-server.md)'s mention of the `yodo/app` repo was corrected to `yodo` in place as a naming fix; the decision itself did not change.

## Alternatives considered
- **Two repos (`yodo-app`, `yodo-api`)** — independent releases, but cross-repo PRs, version coordination and a more complex image build, with no benefit for one developer.
- **Monorepo tooling (Nx, Turborepo)** — caching and dependency graphs for many JS packages; overkill for one web app and one Go module.

## Consequences
- API and frontend changes land atomically in one PR; one version and one release.
- The GitHub Pages URL `sonaszjojka.github.io/yodo/` matches the repo name.
- CI configuration must keep path filters accurate.
