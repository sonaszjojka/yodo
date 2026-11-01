# 0015. Store drawing colours as light values, adapt them when rendering in dark mode

- Status: Accepted
- Date: 2026-10-30

## Context
Yodo has a dark mode for both UI and canvas ([`docs/product.md`](../product.md), "Dark mode"). A drawing made in light mode uses dark ink and pale fills; shown unchanged on a dark canvas, the ink becomes nearly invisible and the fills glare. The same drawing must look right in both themes, in exports, and on other devices with a different theme. The colour values live in the document format ([0013](0013-drawing-document-format-and-versioning.md)), so the choice is hard to change later. The palette itself is in [`docs/ui.md`](../ui.md).

## Decision
- Elements store **one colour value: the light-mode value** (palette colour or custom hex). The document has no theme-specific colours.
- The renderer ([0004](0004-rendering-canvas-2d-roughjs.md)) maps colours at draw time when the canvas is dark: palette colours use their defined dark twin from `docs/ui.md`; custom colours go through one pure adaptation function in `web/src/core` (lightness inverted, hue kept, contrast checked against the dark canvas).
- Export follows the export dialog's "Dark version" switch, using the same mapping. Thumbnails follow the current theme.

## Alternatives considered
- **Store colours as drawn, never adapt** — what you draw is what you get, but light-mode drawings become unreadable in dark mode and the reverse.
- **CSS-style invert filter over the whole canvas** — trivial, but shifts hues (blue turns orange) and inverts images too.
- **Store both a light and a dark value per element** — full control, but doubles colour data and every style edit must update two values.

## Consequences
- A drawing looks right in both themes and the document stays theme-independent.
- The palette needs a curated dark twin for every colour; custom colours rely on an algorithm that can be imperfect for unusual values.
- The adaptation function is pure and unit-tested; a visual test covers a reference drawing in both themes.
- Excalidraw imports (0014) bring their colours as light values, so they are adapted the same way.
