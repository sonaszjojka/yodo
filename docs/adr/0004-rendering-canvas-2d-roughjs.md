# 0004. Render with Canvas 2D and rough.js

- Status: Accepted
- Date: 2026-10-30

## Context
Yodo needs a hand-drawn look (`docs/product.md`) and must stay smooth on a board with ~1,000 elements and several images. It must also export SVG and PNG.

## Decision
Render the board on an HTML `<canvas>` with the Canvas 2D API, using **rough.js** for hand-drawn shapes. Hit-testing (which element is under the cursor) is implemented in the core. SVG export uses rough.js's SVG generator from the same element model.

## Alternatives considered
- **SVG in the DOM** — free hit-testing and events, but thousands of rough.js paths in the DOM degrade performance, the exact problem Yodo wants to fix.
- **WebGL (PixiJS)** — fastest, but rough.js does not fit naturally and complexity rises sharply.

## Consequences
- Good performance headroom; same approach as Excalidraw.
- Hit-testing, selection boxes and redraw scheduling must be written and tested in the core.
- Later optimisations available: caching rough.js shapes per element, viewport culling, layered canvases.
