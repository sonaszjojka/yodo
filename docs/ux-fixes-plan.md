# Yodo post-1.0 UX fixes

## Context
After v1.0.0 the owner reported 7 UX problems in the real app (Home toolbar/theme, arrows, eraser, text over shapes, tool reset). This plan splits the work into (A) what is shown in the Design mock first, and (B) what cannot be validated in a mock and goes straight to code. Decisions made with the owner: theme = segmented control in sidebar footer; Text tool always creates free text; draw tools stay active by default.

## A. Design mock (artifact 94uroz4qyEHt6cUQAftYRM, "Final" page) — new/updated artboards
Edit via the Design type rules (files under `project/`, keep `canvas.json` keys). Existing `F-Home.dc.html` already has a segmented theme control, but inside a gear popover, with search/sort/import in a loose row — replace it.

1. **Home v2** (`F-Home.dc.html` updated, or new `F-Home2.dc.html` next to it to compare):
   - Remove the top-right gear/header. Sidebar footer: 3-button segmented control (System/Light/Dark, icons + labels, `aria-pressed`) + "Keyboard shortcuts" link.
   - Toolbar rows: row 1 = title ("All drawings") left, **"Import file"** as a secondary icon+label button right-aligned; row 2 = full-width-ish search field (left-aligned, grows, max ~480px) and, right-aligned, a compact **Sort** control as a labelled segmented/pill ("Last edited ▾" replaced by an inline "Sort: Last edited" menu button). Options to show in the mock via a prop: (a) sort as menu button, (b) sort as 3-way segmented chips.
2. **Editor — arrow selection** (new artboard `F-Arrows.dc.html`): arrow selected shows endpoint handles + a midpoint handle (curve), no bounding box; bound end shows a highlighted target outline; attaching to a line/arrow shown with a snap dot. Static states side by side (drawing, selected, curved, bound to shape / line / arrow).
3. **Editor — eraser** (same artboard or `F-Eraser`): custom eraser cursor (circle) + hover highlight of the element under the cursor before clicking, faded marked elements while dragging.
4. **Editor — toolbar active state**: show the selected tool staying highlighted after drawing; hint tooltip "Esc / V to select".
5. **Text over shape**: small frame showing free text placed over a rectangle vs. double-click label editing.

Publish: one `Artifact` call with `url`, `root`, changed files + `canvas.json` (new boards, pages `final`, a title note). No verification beyond what the type allows unless asked.

## B. Not mockable — implementation (after mock approval; one branch per task, ADR first where flagged)
Order = smallest/safest first. Each: ADR if architectural, Vitest, e2e where listed, update `docs/ui.md`, `docs/roadmap.md`, `docs/plan.md`.

1. **Tool stays active** (`web/src/core/editor/editor.ts` `drawTool.pointerUp` ~L495-521, `commitText` ~L815): stop switching to `select` and stop auto-selecting after commit; keep note's text-editor opening. Update tests at `editor.test.ts` ~L308/741, `Toolbar.test.tsx`; e2e `editing.spec.ts`. Needs short ADR (reverses Excalidraw-like default).
2. **Free text over shapes** (`core/editor/text.ts` `textTargetAt`/`editFor`, `editor.ts` text tool press ~L790/1058): with the Text tool, always target `'new'` (ignore shape labels); `doubleClick` on select tool keeps label editing. Tests in `text.test.ts`, `note.test.ts`. ADR amending 0026/0027 behaviour (new ADR, don't rewrite).
3. **Eraser feel** (`ui/Canvas.tsx` `cursorFor` L46-55, `core/editor/scene.ts` L36-51, `editor.ts` eraserTool ~L869-931): add eraser cursor (CSS cursor/SVG), hover-highlight state `erasing` preview on pointer move. Tests in `editor.test.ts`.
4. **Home layout + theme** (`ui/Home.tsx` L585-647, `SettingsMenu.tsx`, `index.css` ~L296-770, `useTheme.ts`): remove `.home-header`; theme segmented control + shortcuts link in sidebar footer (reuse `THEME_CHOICES`, `ThemeOptions` logic); rework title row per mock; keep 40px targets, tokens, Phosphor icons. Update `Home.test.tsx`, `SettingsMenu.test.tsx`, `e2e/tests/dark-mode.spec.ts` (L68 clicks Settings), `docs/ui.md` Home table. Editor keeps no theme control.
5. **Arrow selection with handles + curves** (largest; `needs-adr`): new optional field on line/arrow (e.g. `curve`/control point; optional → no schema bump per ADR 0013); endpoint + midpoint handles in `core/geometry/frame.ts` (replace box frame for linear elements), drag logic in `editor.ts`, curved rendering in `core/render/render.ts` and SVG export `core/export/svg/svgScene.ts`, hit-test in `geometry/hit.ts`, Excalidraw import mapping. Split into 5a handles/endpoint dragging, 5b curve, 5c re-attaching existing arrows.
6. **Bind to lines and arrows** (`core/editor/binding.ts` `isBindable` L25, `snapToOutline` L119, `followBindings` L202; ADR 0048 says only shapes): extend bindable targets to line/arrow with a segment-ratio binding; guard against cycles (arrow bound to itself/chain). New ADR superseding the "shapes only" part of 0048. Depends on 5.

## Verification
- Per part: `npm test`, `npm run lint`, `npm run format:check`, `npm run build` in `web/`; `go` untouched.
- e2e (`e2e/`): `npm test` for editing/dark-mode/shortcuts specs; run `npm run test:visual` and update baselines only for deliberate rendering changes (curves, eraser).
- Manual: draw rect → ellipse repeatedly without re-picking tool; Text tool click inside a rectangle; erase hover; theme switch from Home sidebar; arrow endpoint/curve drag and binding to a line.
- Stage end: doc sweep for stale items (notify owner before editing).
