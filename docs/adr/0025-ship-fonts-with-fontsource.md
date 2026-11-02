# 0025. Ship fonts as Fontsource npm packages bundled by Vite

- Status: Accepted
- Date: 2026-11-02

## Context
Roadmap 1.9 adds text, the first canvas feature that needs a web font: new text uses the Hand font, Caveat (`docs/ui.md`, Typography). Manrope (UI and the Sans canvas font) and JetBrains Mono (Mono) follow later. `index.css` left "how fonts are shipped" open until a font was needed.

The fonts must work offline in hosted mode (local-first, ADR 0005) and in the self-hosted Docker image, which serves only what is in `web/dist` (ADR 0019). Canvas text is a special case: the canvas draws with whatever font is loaded at that moment and never redraws on its own, and text boxes are sized by measuring the text. A font that loads late gives a fallback look and wrong sizes until the next redraw.

## Decision
Each font is a [Fontsource](https://fontsource.org) npm package (variable version where one exists, e.g. `@fontsource-variable/caveat`), imported once in `main.tsx`. Vite bundles the CSS and the `woff2` files with hashed names into `dist`, so they are served from the app's own origin in both modes.

- Add a font only when a feature needs it. 1.9 adds Caveat; Manrope and JetBrains Mono come with the features that use them (the font picker, roadmap 2.1/2.2). Until then, `sans` and `mono` text falls back to system fonts.
- The core maps each `FontFamily` to a CSS font stack, so a missing font always has a fallback.
- At startup the UI asks the browser to load the canvas fonts (`document.fonts.load`) and redraws the canvas when loading finishes.

## Alternatives considered
- **Commit the `woff2` files and write `@font-face` by hand.** No dependency, but subsetting, upgrades and licence tracking would all be manual.
- **Google Fonts CDN.** Nothing to bundle, but it breaks offline and self-hosted use and sends every visit to a third party.

## Consequences
- Each font is a dependency with a pinned version, updated like any other, and its OFL licence ships inside the package.
- Fontsource splits each font into `unicode-range` subsets, so the browser downloads only the scripts a page uses (Latin and Latin Extended cover Polish).
- Text measured before its font finished loading keeps a slightly wrong box until it is edited again. Loading at startup makes that unlikely.
- SVG/PNG export (later) must embed or rasterise the same fonts.
