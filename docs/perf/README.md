# Performance benchmark

The target (`docs/product.md`, ADR [0042](../adr/0042-performance-benchmark-on-demand-results-in-git.md)): on the generated reference board (1,000 mixed elements plus 5 images of ~2 MP), pan and zoom stay at **≥ 55 fps** and drawing a shape has **no frame over 32 ms**, in Chrome on an Apple-silicon Mac.

## Run it
From `e2e/`, with Google Chrome installed (it opens a real window):

```
npm run perf                    # build, run, assert the target
PERF_RECORD=1 npm run perf      # also append a line to docs/perf/results.jsonl
PERF_NOTE="what changed" PERF_RECORD=1 npm run perf
```

Leave the machine idle while it runs. It is not part of `npm test` or CI.

## Read `results.jsonl`
One JSON object per line, oldest first. Each has the date, commit, Chrome version, viewport, pixel ratio, architecture, CPU and OS, plus `pan`, `zoom` and `draw`, each with `fps`, `p95FrameMs` and `maxFrameMs`. The pass criteria are `pan.fps` and `zoom.fps` ≥ 55 and `draw.maxFrameMs` ≤ 32. Compare lines only when the environment fields match.
