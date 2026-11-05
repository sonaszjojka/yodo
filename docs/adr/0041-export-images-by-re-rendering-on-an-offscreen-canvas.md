# 0041. Export images by re-rendering the scene on an offscreen canvas

- Status: Accepted
- Date: 2026-11-05

## Context
Roadmap 2.7 exports the drawing or the selection as an image, with or without background, in a light or dark version, at a chosen scale (`docs/product.md`, Export PNG / SVG). The editor already draws elements with `renderScene` ([0004](0004-rendering-canvas-2d-roughjs.md)), Home thumbnails reuse it ([0034](0034-render-thumbnails-on-home.md)), and colours are adapted to the theme at render time ([0015](0015-store-light-colours-adapt-in-dark-mode.md)). Export needs a bitmap that does not depend on the window size, the camera or the current theme.

## Decision
PNG export calls `renderScene` again on an offscreen canvas sized to the export frame: the elements to export, their bounds including any label text that overflows its shape ([0026](0026-shape-text-as-label-field.md)), plus 16 world units of padding. The camera is the frame's corner at `zoom = scale`, `dpr = 1`, and the theme is the dialog's "Dark version" choice. `Surface.background` paints the page colour under the elements, or leaves the canvas transparent. The selection overlay is never drawn. The dialog shows that same canvas as its preview and encodes it with `toBlob` for Copy (`ClipboardItem`) and Download. Scales are 1x, 2x and 3x, and a scale is disabled when the canvas would pass 16384 px on a side or 64 million pixels, the limits browsers enforce. Core logic (`web/src/core/export/`) is pure and takes `measure` as a parameter, like the text layout.

SVG export (roadmap 2.7b) is a second output path and gets its own ADR.

## Alternatives considered
- **Crop the editor's canvas.** No new code, but it exports only what is on screen, at the screen's zoom and pixel ratio, with the selection overlay and the current theme baked in.
- **Generate SVG first and rasterise it.** One output path for both formats, but fonts must be embedded for the rasteriser, Safari taints canvases drawn from some SVG images, and there would be two renderers (canvas for the editor, SVG for export) to keep in agreement.

## Consequences
- One renderer for the editor, thumbnails and PNG export: a change to how an element looks shows up everywhere.
- Images (roadmap 2.6) export once they render in `renderScene`; the export must then wait until the image blobs are loaded.
- A very large drawing at 3x can be disabled by the size limit; the dialog says so instead of failing.
- The export waits for `document.fonts.ready` so text has the shape it has on screen.
