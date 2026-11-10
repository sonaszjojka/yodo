# Contributing to Yodo

Thanks for your interest! Yodo is a local-first, hand-drawn style drawing app. Bug reports, ideas, docs fixes and code are all welcome. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Ways to help
- **Report a bug or suggest a feature:** open an [issue](../../issues/new/choose). Search first; add steps to reproduce, your browser and whether you use the hosted or self-hosted mode.
- **Ask a question:** use [Discussions](../../discussions), not issues.
- **Pick up work:** look for [`good first issue`](../../labels/good%20first%20issue) and [`help wanted`](../../labels/help%20wanted). The plan is in [`docs/roadmap.md`](docs/roadmap.md). Comment on an issue before you start so two people don't build the same thing.
- **Report a security problem:** see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Set up (about 10 minutes)
You need Git, Node 26 (see `web/.nvmrc`; `nvm use`), Go 1.27 and, for linting the server, [golangci-lint](https://golangci-lint.run) 2.15.

```sh
git clone https://github.com/<you>/yodo.git   # your fork
cd yodo/web && npm ci && npm run dev            # frontend on a dev server (hosted mode, IndexedDB)
cd ../server && go run ./cmd/yodo               # optional: the Go server (self-hosted mode)
```

The monorepo has `web/` (React + Vite + TypeScript), `server/` (Go), `e2e/` (Playwright) and `docs/`. The full command tables and the architecture are in [`CLAUDE.md`](CLAUDE.md) (written for AI agents, but it is the shortest accurate reference for humans too).

Checks to run for the part you changed:

| Part | Commands (from that folder) |
|---|---|
| `web/` | `npm test` · `npm run lint` · `npm run format:check` · `npm run build` |
| `server/` | `go test ./...` · `golangci-lint run` · `golangci-lint fmt --diff` |
| `e2e/` | `npm test` · `npm run lint` · `npm run typecheck` (needs `npx playwright install` once) |

CI runs the same commands, so a green local run means a green PR.

## Making a change
1. **Fork** the repository and create a branch from `main`: `<type>/<short-slug>`, e.g. `fix/undo-after-delete`.
2. Make **small, focused** changes, with tests for new behaviour (see [ADR 0011](docs/adr/0011-testing-strategy.md)). UI changes: check them in the browser, in light and dark theme.
3. **Sign off your commits** with `git commit -s` ([Developer Certificate of Origin](#developer-certificate-of-origin)).
4. **Architectural changes need an ADR** in [`docs/adr/`](docs/adr/README.md) (a new storage format, dependency, API or structure). If unsure, open an issue first and we will decide together. Never edit an accepted ADR; write a new one that supersedes it.
5. Open a **pull request** to `main`. The PR title becomes the commit on `main`, so it must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, with types `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style` and scopes `web`, `server`, `e2e`, `mcp`, `docs`, `ci`, `deps`. Details are in [`docs/conventions.md`](docs/conventions.md).
6. CI must be green and every review thread resolved. PRs are squash-merged. A maintainer aims to respond within about a week; this is a goal, not a promise.

Merged work reaches users with the next release, not immediately: releases are cut from `main` by tag ([ADR 0057](docs/adr/0057-deploy-the-hosted-app-from-release-tags.md), [0058](docs/adr/0058-release-please-for-versions-and-changelog.md)). Try unreleased work with the `edge` Docker image.

## Using AI tools
Fine, if you understand, test and can explain every line you submit. The repo contains maintainer workflows under `.claude/` and `.agents/`; you don't need them.

## Developer Certificate of Origin
Yodo uses the [DCO](https://developercertificate.org/) instead of a CLA ([ADR 0059](docs/adr/0059-developer-certificate-of-origin-instead-of-a-cla.md)). By adding a `Signed-off-by: Your Name <you@example.com>` line (`git commit -s`) you state that you wrote the change or have the right to submit it under the project's [MIT license](LICENSE). Forgot? `git rebase --signoff main` then force-push your branch.

## License
Contributions are licensed under the [MIT License](LICENSE).
