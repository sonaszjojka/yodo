# 0044. Guard the export with visual baselines made and checked in one pinned Playwright image

- Status: Accepted
- Date: 2026-11-05

## Context
[0011](0011-testing-strategy.md) plans a handful of visual regression scenes and says baselines must come from a fixed environment, not a developer machine. The PNG and SVG export paths ([0041](0041-export-images-by-re-rendering-on-an-offscreen-canvas.md), [0043](0043-export-svg-with-a-parallel-pure-svg-renderer.md)) draw the same scene twice, so a change to rendering, colour adaptation ([0015](0015-store-light-colours-adapt-in-dark-mode.md)) or fonts can alter one output and not the other. Roadmap 2.7c asks for a baseline of a few scenes, each in light and dark. Playwright's own guidance is that baselines are only valid in the environment that made them, and the e2e job runs on a moving `ubuntu-latest` ([0035](0035-e2e-playwright-package-both-modes.md)).

## Decision
**Subject.** The exported files, not the editor canvas. Per scene and theme the test imports a deterministic `.yodo` document, downloads the PNG ("Dark version" for dark) and the SVG, and compares each with a committed PNG baseline using `toMatchSnapshot` (`maxDiffPixelRatio: 0.002`, for anti-aliasing noise only). The SVG is drawn as an `<img>` in a blank page and the element is screenshotted. Three scenes (shapes and fills, text and labels, a mixed one with a pencil stroke, opacity and overlap) times two themes times two formats give 12 baselines. Image elements are left out: `export-png.spec.ts` covers them.

**Scope.** Chromium and hosted mode only. The renderer is the same in both modes, and Firefox and WebKit rasterise text differently, which would triple the baselines for no extra signal.

**Separate suite.** `e2e/playwright.visual.config.ts` with its own test directory, `e2e/visual/`, so `npm test` and its six projects never see it. It needs one server only: `scripts/serve-dist.ts`, a small static server for the built `web/dist` under `/yodo/` (the Pages path). No Go binary and no Vite are needed.

**One pinned environment.** Baselines are made and compared only inside `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` equals the `@playwright/test` version, run as `linux/amd64` (CI's architecture).
- Locally, `npm run test:visual` and `npm run test:visual:update` in `e2e/` build `web/dist` on the host and run the suite in that image through `scripts/visual-docker.sh`, which fails if the image tag and the installed Playwright disagree.
- In CI a `visual` job runs in the same image as a job container, builds the web app and runs the same suite. It joins the `ci` gate's `needs` ([0018](0018-ci-github-actions-gate-job.md)) and uploads the report (expected, actual, diff) when it fails.

A baseline changes only through a deliberate `test:visual:update` whose image diff is reviewed in the PR.

**Deterministic scenes.** Scenes are plain objects in `e2e/visual/scenes.ts` with fixed ids and rough.js seeds, loaded through the real import path, so no mouse drawing and no randomness are involved. Fonts are bundled ([0025](0025-ship-fonts-with-fontsource.md)), so only the rasteriser has to be pinned.

## Alternatives considered
- **Screenshot the editor canvas.** It shows what the user sees, but the task is about the export, and the canvas depends on viewport and zoom.
- **Platform-suffixed baselines for macOS and Linux.** No Docker locally, but twice the files and the Mac set would drift from CI.
- **Generate baselines in a CI job that commits them.** No Docker locally, but a slow loop and bot commits to review.
- **Keep the suite in the existing e2e job.** The runner is not pinned, so the same code could render differently after a runner update.
- **All six projects.** Triples or sextuples the baselines; the extra browsers show text differences, not export regressions.

## Consequences
- Visual tests need Docker locally (only to update or debug a failure); `npm test` stays free of them.
- A Playwright upgrade means bumping the image tag with it, and usually regenerating the baselines in the same PR.
- Running `amd64` on an Apple-silicon Mac is slower (emulation), but it is the one environment CI uses.
- One more CI job, and a new place for rendering changes to show up as image diffs in review.
