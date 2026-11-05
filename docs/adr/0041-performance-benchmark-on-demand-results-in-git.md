# 0041. Track performance with an on-demand Playwright benchmark whose results are committed as JSONL

- Status: Accepted
- Date: 2026-11-05

## Context
`docs/product.md` sets a performance target: on a generated reference board (1,000 mixed elements plus 5 images of ~2 MP), panning and zooming keep at least 55 fps and drawing a shape produces no frame over 32 ms, in Chrome on an Apple-silicon Mac. It must be "measured by a Playwright performance test, tracked over time rather than gated on every CI run (CI machines vary)". Roadmap 2.12 asks for that test and for the results to be recorded. The e2e package already exists ([0035](0035-e2e-playwright-package-both-modes.md)).

## Decision
**A separate suite.** `e2e/perf/` holds the benchmark and its own config, `playwright.perf.config.ts`. It is run with `npm run perf` and is not part of `npm test` or CI. It uses one project: the system Chrome, headed, at a fixed 1440×900 viewport and a pixel ratio of 2, against the self-hosted server (the renderer is the same in both modes, and seeding through the HTTP API is simple).

**The board** is generated from a fixed seed (`e2e/perf/board.ts`) and seeded through `/api/images` and `/api/drawings`, so every run draws the same thing.

**Measuring.** A `requestAnimationFrame` loop in the page records frame times while one input event per frame drives the gesture (wheel for pan, Ctrl+wheel for zoom). The draw uses real mouse events. The test checks that the gesture really happened (the canvas changed; the new rectangle reached the store at the dragged size) so an idle page can't pass.

**Recording.** With `PERF_RECORD=1` a run appends one JSON line to `docs/perf/results.jsonl`: date, commit, Chrome version, headed or not, viewport, pixel ratio, architecture, CPU, OS and the three results. The history lives in git. Only runs on the target class of machine count as acceptance evidence.

## Alternatives considered
- **Gate it in CI** — shared runners vary too much, so it would flake; the product scope already rules it out.
- **A CI artifact or a benchmark service (for example github-action-benchmark)** — needs a `gh-pages` branch or an external service, for a project with one maintainer and a target tied to one machine class.
- **CDP tracing or timing Playwright calls** — tracing is heavier and more brittle; timing calls measures round trips, not frames.
- **Test in all six e2e projects** — the target names Chrome, and the numbers from Firefox and WebKit would have no target to compare against.

## Consequences
- Performance is checked by hand, so a regression is found only when someone runs `npm run perf`; the results file makes the trend visible when they do.
- Numbers from different machines or Chrome versions are not directly comparable; each line records the environment.
- Running it needs Google Chrome installed and a display.
