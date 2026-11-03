# 0028. UI icons from the `@phosphor-icons/react` package

- Status: Accepted
- Date: 2026-11-03

## Context
Roadmap 1.10 adds the editor's tool toolbar, the first UI that needs icons. `docs/ui.md` already picked **Phosphor** (Regular weight, Fill for active states) and left the dependency for when a feature needed it. Later features need many more icons: the Home sidebar and card menus, the style panel, and a folder-icon picker that offers a whole set of line icons.

Icons must work offline in both modes, so they ship in `web/dist` like the fonts (ADR 0025).

## Decision
Use the official [`@phosphor-icons/react`](https://github.com/phosphor-icons/react) package (MIT). Each icon is a React component that renders inline SVG with `currentColor`, so it follows the UI colour tokens and, later, dark mode. The weight is a prop (`weight="regular"` or `"fill"`).

- Icons are imported by name only in `web/src/ui/` (the core never renders UI, ADR 0002).
- The package declares `sideEffects: false`, so the production build keeps only the icons that are imported.
- Icon-only buttons still need an `aria-label` and a tooltip (`docs/ui.md`, Principles); the SVG itself is decorative.

## Alternatives considered
- **Copy the Phosphor SVG paths into a local `icons.tsx`.** No dependency, but every new icon is a manual copy and the folder picker would need dozens.
- **The mockup's own hand-made paths.** No dependency, but they don't match `docs/ui.md` and have no Fill variants.

## Consequences
- One runtime dependency, pinned and updated like the others; the MIT licence ships in the package.
- The dev server loads the package's full index (about 1,500 icons) on first start; production bundles are unaffected.
- Swapping icon sets later means touching every import, so imports stay in `ui/` components only.
