# 0018. Run CI as one GitHub Actions workflow with path filters and a gate job

- Status: Accepted
- Date: 2026-11-01

## Context
Roadmap 0.3 needs CI for `web/` and `server/` that runs only the jobs a change affects (path filters), and a Pages deploy on merge to `main` ([0007](0007-distribution-pages-and-docker-go-server.md)). `main` is protected and should require CI to pass (`docs/conventions.md`). On GitHub, a workflow skipped by `on: paths:` never reports its check, so a required check stays "Expected — waiting" and a docs-only PR can never merge. The workflows also run third-party code with access to the repository token, so how actions are referenced is a supply-chain question.

## Decision
- **One workflow, `.github/workflows/ci.yml`,** runs on every pull request and every push to `main`.
- A **`changes` job** uses `dorny/paths-filter` to detect whether `web/**` or `server/**` changed; workflow edits count as both, so they exercise every job.
- **`web` and `server` jobs** run only when their part changed, using the same commands as locally (format check, lint, tests, type-check/build; [0017](0017-formatting-go-lint-and-go-tools.md)). Node comes from `web/.nvmrc`, Go from `server/go.mod`.
- A **`ci` gate job** runs always (`if: always()`) and fails if any job it needs failed or was cancelled; skipped jobs pass. It is the **only required status check** on `main`.
- **Deploy** runs only on push to `main` after `web` passed, and publishes the `dist/` that `web` built (built once, as in 0007) with the official Pages actions.
- **Every action is pinned by full commit SHA** with the version as a comment (`@<sha> # v7.0.1`), following GitHub's security-hardening guide and OpenSSF Scorecard.

## Alternatives considered
- **Gate job + `git diff` script** — no third-party action, but we would own the base-commit edge cases (push vs PR, first push, force-push).
- **Native `on: paths:` in separate workflows** — simplest YAML, but the checks can't be required, so `main` would have no CI gate.
- **Major version tags (`@v5`)** — readable and auto-updating, but a tag can be moved to malicious code; a SHA can't.

## Consequences
- One required check (`ci`) stays stable as jobs are added; new jobs only need to be listed in the gate's `needs`.
- One third-party action (`dorny/paths-filter`) in the pipeline, pinned by SHA.
- Action updates are manual SHA bumps; Dependabot for `github-actions` can automate them later.
- The Docker image job (0.4) and e2e job join this workflow behind the same gate.
