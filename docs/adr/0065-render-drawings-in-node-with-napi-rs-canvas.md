# 0065. Render drawings in the MCP server with `@napi-rs/canvas`: real text measurement and PNG through the export renderer

- Status: Accepted
- Date: 2026-11-11

## Context
Roadmap 5.5 (#182): "`render_drawing`: SVG and PNG the agent can see. Whole drawing, selected ids or a region as MCP image content (SVG from `buildSvg`, PNG through a rasterizer, light or dark); fonts load in Node; text `measure` choice recorded in an ADR; output compared against the existing export scenes; new dependencies approved first."

The MCP server ([0061](0061-mcp-server-as-a-typescript-package-in-mcp.md)) runs in Node, where there is no canvas. Two things the browser gets for free are missing there:
- **Text measurement.** `layoutText` wraps labels and sizes free text with an injected `Measure` ([0025](0025-ship-fonts-with-fontsource.md), [0027](0027-edit-text-in-textarea-overlay.md)). The app passes a canvas-backed one. `estimateMeasure` (0.55 em per character) exists for tests only, and for a proportional font it puts line breaks and label boxes in different places than the app.
- **A PNG.** Many agents can only look at raster images. `buildSvg` ([0043](0043-export-svg-with-a-parallel-pure-svg-renderer.md)) already runs in Node, but something must turn its output, or the scene, into pixels.

The fonts are Fontsource variable `.woff2` files, and only `.woff2`. Most SVG rasterizers (resvg among them) read only TTF/OTF and ignore `@font-face` data URIs, so they would need the fonts converted at runtime.

A spike (2026-11-11, `@napi-rs/canvas` 1.1.0 on macOS arm64) registered the Caveat, Manrope and JetBrains Mono latin `.woff2` files with `GlobalFonts.registerFromPath`. `measureText` returned per-font widths (JetBrains Mono at 0.6 em per character, as its metrics say), and `fillText` drew the right typefaces into a PNG.

## Decision
The MCP server renders with **`@napi-rs/canvas`**, a Skia-based Canvas 2D implementation for Node with prebuilt binaries. The same dependency covers both missing pieces.

- **Measure.** At startup the server registers every Fontsource `.woff2` subset file under the CSS family name that `FONT_STACKS` uses (`Caveat Variable`, `Manrope Variable`, `JetBrains Mono Variable`). Its `Measure` is `ctx.measureText(text).width` on a `@napi-rs/canvas` context with `ctx.font = font`, which is the same code shape as the app's `createCanvasMeasure`. Layout, frames and wrapping use the same metrics as the browser.
- **PNG.** PNG goes through `renderExport` and `renderScene`, the browser's PNG path ([0041](0041-export-images-by-re-rendering-on-an-offscreen-canvas.md)). It draws on a `@napi-rs/canvas` canvas with `rough.canvas`, then encodes with `canvas.toBuffer('image/png')`. Chrome draws with Skia as well, so the output is close to the app's own PNG export.
- **SVG.** SVG is `buildSvg` with the same measure, `rough.generator()`, and the needed fonts embedded as base64 (`neededFontFiles`, `fontFaceCss`), exactly as the export dialog builds it.
- **Fonts in the bundle.** The `.woff2` files are bundled into `dist/index.js` (about 400 KB of font data) through Vite asset imports, so the server needs no font files beside it. `mcp/` adds the three `@fontsource-variable/*` packages and `roughjs` as dev dependencies (bundled), at the versions `web/` uses.
- **Runtime dependency.** `@napi-rs/canvas` ships a native `.node` binary for each platform, which can't go into the one-file bundle. It is the package's first runtime `dependency` and stays external in the Vite build (`ssr.external`), so npm installs the right binary.

## Alternatives considered
- **fontkit for widths + resvg (wasm) for PNG:** portable, and the bundle stays dependency-free. But it needs two dependencies plus a woff2-to-TTF step for resvg. Its PNG would rasterize the SVG path rather than the canvas path the app's PNG uses, and its glyph-advance widths skip the shaping and kerning a canvas applies.
- **`estimateMeasure` + resvg:** the smallest change, but proportional text wraps differently from the app, which weakens both the comparison against the export scenes and what the agent sees. The font problem for rasterizing stays.
- **`skia-canvas` or `canvas` (node-canvas):** the same idea. node-canvas needs Cairo and a build toolchain on some platforms. skia-canvas is larger and has its own font API. `@napi-rs/canvas` has no system dependencies and the smallest install (about 29 MB in the spike).
- **A headless browser (Playwright):** an exact match, but hundreds of MB and a browser process per render.

## Consequences
- The PNG an agent sees is drawn by the same `renderScene` as the app's export, and wrapped text matches the app's. Against the export baselines (ADR 0044), the shape scenes match pixel for pixel and the text scene differs in about 1.1% of pixels (glyph advances differ by about 1%).
- `core/render/render.ts` no longer uses DOM types: `SceneContext` lists the Canvas 2D members it uses, and pictures are an opaque `SceneImage`, so `mcp/`'s Node-only type-check (0061) accepts the export path. The browser's context and `@napi-rs/canvas`'s both fit it unchanged.
- `yodo-mcp` is no longer dependency-free: installing it fetches a prebuilt native binary, so it works only on platforms `@napi-rs/canvas` ships for (macOS, Linux glibc/musl, and Windows on x64 and arm64). The bundle's `THIRD_PARTY_LICENSES.md` doesn't cover the external package, which carries its own license.
- The bundle grows by about 550 KB of base64 font data.
- A font subset that `GlobalFonts` won't register, or a script none of the fonts cover, falls back to a system font, as in the browser.
- Image elements are drawn as the export's placeholder for now. Neither repository gives the MCP server image bytes yet; loading them (`/api/images`, the file backend's inlined `files`) is a follow-up.
