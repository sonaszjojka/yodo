# 0011. Test with a pyramid: unit, repository contract, Go API, and a few end-to-end and visual tests

- Status: Accepted
- Date: 2026-10-30

## Context
Most of Yodo's risk is in pure logic (geometry, hit-testing, undo/redo) and in two storage modes that must behave the same ([0005](0005-browser-storage-indexeddb.md), [0006](0006-self-hosted-storage-go-sqlite.md)). The canvas renders pixels, so DOM assertions cannot check drawing output. Testing and CI are a stated learning and portfolio goal.

## Decision
| Layer | Tool | Scope |
|---|---|---|
| Core unit | Vitest | Element model, geometry, hit-testing, undo/redo |
| Repository contract | Vitest + `fake-indexeddb` | One shared suite run against every `DrawingRepository` implementation |
| UI components | Vitest + React Testing Library | A few key interactions in the UI shell |
| Go API | `testing` + `net/http/httptest` | Table-driven handler and middleware tests on a real temporary SQLite file |
| End-to-end | Playwright | 3–5 key flows, in both hosted and self-hosted modes |
| Visual regression | Playwright screenshots | A handful of reference scenes; rough.js uses a fixed seed per element |

- Core logic is written test-first where practical; every feature ships with tests.
- CI fails on any test failure. No fixed coverage percentage target.
- Visual baselines are generated in a fixed environment (CI / Docker), not on a developer machine.

## Alternatives considered
- **Testing trophy (integration-heavy)** — survives refactors, but weak for canvas math where the UI is pixels.
- **E2E-heavy** — high confidence, but slow, flaky and hard to debug.
- **Unit tests with mocks everywhere** — fast, but mocks drift and storage bugs slip through.
- **Minimal testing** — least effort, but regressions and a weak fit for the project goals.
- **Jest** instead of Vitest — slower and more configuration with Vite. **Cypress** instead of Playwright — slower, weaker WebKit support. **testify** — optional later; stdlib is the idiomatic default.

## Consequences
- Fast feedback on core logic; both storage modes proven equivalent by the contract suite.
- Several tools to configure and keep in CI.
- Visual snapshots can fail on rendering changes and need deliberate baseline updates.
- Large core refactors require updating unit tests.
