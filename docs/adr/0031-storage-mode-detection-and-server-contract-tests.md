# 0031. Pick the storage mode with a health probe; run the contract suite against a real server

- Status: Accepted
- Date: 2026-11-03

## Context
Roadmap 1.13 adds `HttpDrawingRepository` for self-hosted mode ([0006](0006-self-hosted-storage-go-sqlite.md), [0030](0030-drawings-http-api.md)). The same build runs on GitHub Pages and inside the Go server ([0007](0007-distribution-pages-and-docker-go-server.md)), so the app has to find out at runtime which `DrawingRepository` to use ([0005](0005-browser-storage-indexeddb.md)). The new repository must also pass the shared contract suite ([0011](0011-testing-strategy.md)) against a running server, not a mock.

Three facts constrain the choice:
- GitHub Pages answers unknown paths with an HTML `404`.
- The Vite dev server answers every path, `/api/health` included, with `index.html` and `200`.
- The server requires an `Origin` header on `PUT`/`DELETE` ([0020](0020-auth-and-origin-checks.md)). Browsers send it on their own; Node's `fetch` does not.

## Decision
**Mode detection.** Before the first render, the app sends `GET api/health`, resolved against `document.baseURI` so it works under `/yodo/` and `/`, with a 2-second timeout. It uses `HttpDrawingRepository` only when the reply is `200` with the JSON body `{"status":"ok"}`. Any other status, a non-JSON body, a network error or a timeout means IndexedDB.

**Server-backed contract tests.** A separate Vitest project runs with `npm run test:server`:
- Its `globalSetup` builds `server/cmd/yodo` with `go build`, starts it on a free port with a temporary `YODO_DATA_DIR` and a matching `YODO_ALLOWED_ORIGINS`, waits until `/api/health` answers, and stops it at the end.
- The tests empty the store through the API before each test. Their `fetch` adds the `Origin` header a browser would send.
- CI runs it in its own `web-server` job with Node and Go, listed in the `ci` gate's `needs` ([0018](0018-ci-github-actions-gate-job.md)). `npm test` stays Go-free and fast.

**Strict serialization.** `HttpDrawingRepository` serializes with a `JSON.stringify` replacer that throws on functions and symbols. `JSON.stringify` would otherwise turn them into `null` or drop them silently, while IndexedDB throws `DataCloneError`. The contract's "a save that fails stores nothing" test therefore holds in both modes. The replacer also throws on non-finite numbers and `undefined` array entries, which JSON would store as `null`: such a save fails instead of changing the drawing, although IndexedDB would store them.

**Ids that can't be a path segment.** The URL standard collapses a `.` or `..` path segment (escaped as `%2e` or not), so `HttpDrawingRepository` refuses those ids with a `TypeError` before sending a request. Ids the app creates are UUIDs ([0013](0013-drawing-document-format-and-versioning.md)).

## Alternatives considered
- **Detect with `res.ok` only.** Simpler, but the Vite dev server's `200` fallback would wrongly pick HTTP mode.
- **A build-time flag (`VITE_STORAGE=http`).** Needs no probe, but then the Pages and Docker builds differ, which breaks the one-build rule of 0007.
- **Start the server inside plain `npm test`.** One command, but every web test run, locally and in CI, would then need Go and wait for a compile.
- **Run against a server given by `YODO_TEST_SERVER_URL`, and skip without one.** Needs no tooling, but the suite is easy to skip without noticing, so the 1.13 criterion isn't really enforced.
- **Mock `fetch` (e.g. MSW).** Fast, but it proves the client against a fake server, the mock drift that 0011 rules out.

## Consequences
- In self-hosted mode the first render waits for one local request. On Pages it waits for one `404`, or for the 2-second timeout at worst.
- `npm run dev` always uses IndexedDB. Using the Go server from the dev server would need a proxy and an extra allowed origin; that is left for later.
- Running `npm run test:server` locally needs Go 1.27, the same as the server.
- A new CI job, and a second Vitest config to maintain.
