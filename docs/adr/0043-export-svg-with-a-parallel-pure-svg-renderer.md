# 0043. Export SVG with a parallel pure SVG renderer and embedded fonts

- Status: Accepted
- Date: 2026-11-05

## Context
Roadmap 2.7b exports the drawing or the selection as SVG, with the same options as PNG except scale (`docs/product.md`). [0041](0041-export-images-by-re-rendering-on-an-offscreen-canvas.md) chose a canvas re-render for PNG and left SVG as a second output path with its own ADR. An SVG should be real vector output (selectable text, small files, editable in other tools), so a canvas screenshot wrapped in SVG does not qualify.

## Decision
A new pure module, `web/src/core/export/svg/`, turns the elements to export into an SVG document. It takes the same frame (bounds plus 16 units of padding, [0041](0041-export-images-by-re-rendering-on-an-offscreen-canvas.md)), theme and background choice as PNG, and `measure` as a parameter. Shapes use rough.js's SVG generator (`rough.generator()` ops turned into `<path>` data) with the same per-element seed and options as `renderScene`, so the wobble matches the canvas. Pencil strokes and notes reuse the same geometry helpers as the canvas code ([0024](0024-pencil-strokes-smoothed-canvas-path.md), [0038](0038-sticky-notes-as-note-element.md)). Text is real `<text>` laid out by the shared layout function ([0026](0026-shape-text-as-label-field.md)). Images become `<image>` tags with `data:` URIs. Colours go through the same theme adaptation as rendering ([0015](0015-store-light-colours-adapt-in-dark-mode.md)).

The file embeds the fonts it uses as base64 `@font-face` rules, taken from the Fontsource `woff2` files ([0025](0025-ship-fonts-with-fontsource.md)), only for the families that appear in the exported text. The SVG then looks the same on a machine without those fonts. No subsetting: it would need a new dependency, and the files stay at a few tens of kB per family.

The core builds a small DOM-free node tree and serialises it to a string, so it stays framework-free ([0002](0002-frontend-react-typescript-vite.md)) and is testable in Node. The dialog gets an SVG tab sharing the options, shows the result as its preview, and offers Copy (as text) and Download.

## Alternatives considered
- **Record canvas calls and replay them as SVG** — one renderer, but the serializer must emulate paths, transforms and text from a narrow Canvas 2D slice, and text would lose its structure.
- **A canvas-to-SVG library** — least code, but a new, aging dependency with little control over fonts and clipping.
- **Reference fonts by name only** — smaller file, but text falls back to another font wherever the font is not installed.

## Consequences
- Two renderers (canvas and SVG) now have to agree. A parity test compares the geometry of each element type, and a new element type must add its SVG path.
- Exported SVGs are self-contained and portable, at the cost of file size when several font families are used.
- Embedded images make the file as large as the images.
