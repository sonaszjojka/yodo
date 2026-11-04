# Yodo — UI Direction

> Status: **approved 2026-10-30** (Stage 4 of `docs/plan.md`). Settles layout, look and interaction rules before code. The mockup is a guide for the general idea, not a pixel spec; details are refined feature by feature.
>
> Mockup (claude.ai design canvas, private to the owner): https://claude.ai/artifact/94uroz4qyEHt6cUQAftYRM — page **Final** is the approved version; **Round 1** and **Round 2** are kept as history.

## Principles
- **Canvas first.** Controls float over the canvas; nothing permanently eats drawing space.
- **Controls where you work.** Quick style controls appear right above the selection; the full set is one click away.
- **No hidden tabs on screen edges.** A hidden panel leaves nothing behind; it reopens from a toolbar button or a shortcut.
- **Panels are movable and resizable.** The user decides where the style panel sits and how big it is; it can snap back to its default place.
- **Icons are always visible, important actions have text labels.** Icon-only buttons only where the meaning is unambiguous (e.g. delete forever), always with a tooltip and an accessible label.
- **Show only what applies.** Controls change with what is selected: shape, text, or nothing.

## Screens (MVP)
| Screen | Layout |
|---|---|
| Home | Left sidebar: logo, **New drawing**, **Import file** (`.yodo` or `.excalidraw`, ADR 0014), All drawings, Folders, Trash. Main area: title, search, sort, Settings menu (theme, shortcuts, about); card grid that starts with a **"+ New drawing" tile**. |
| Drawing card | Thumbnail, name, folder icon + name, last edited. **⋯ button and right-click** open the same menu: Open, Open in new tab, Rename, Duplicate, Move to folder, Export as `.yodo`, Move to Trash. |
| Editor | Top: menu/back + drawing name (left), tool toolbar (centre), style-panel toggle + Export (right). Bottom: undo/redo, zoom, hint, save status, shortcuts. Contextual bar above the selection; style panel on the right. |
| Trash | Sidebar as on Home. A small bar directly above the list: count + **Empty trash** (with confirm dialog). Rows: Restore (icon + label), delete forever (icon only). |
| Search results | Split into "In names" (cards) and "In text on the canvas" (rows with highlighted snippets). |
| Export dialog | Tabs PNG / SVG / Yodo file; scope (whole drawing or selection), background on/off, dark version, scale (PNG), file name, Copy / Download. |
| Keyboard shortcuts | Modal with search, grouped (Tools, Editing, View, Drawings). Key choices are placeholders until each feature is built. |
| Password screen | Self-hosted only, when `YODO_PASSWORD` is set (ADR 0020): password, "Remember this browser", Unlock, clear error state. |

## Editing styles
- **Contextual bar** above the selection:
  - shape: stroke, fill, width, look (hand-drawn / clean), **All styles**, more;
  - text: font, size S/M/L/XL, **All styles**, more;
  - more (any selection): duplicate, copy/paste style, bring to front, delete.
  - Each control opens one small popover at a time. No bar when nothing is selected.
  - Steps: width Thin 1 / Bold 2 / Extra bold 4 px; look Hand-drawn (roughness 1) / Clean (0); size S 16 / M 20 / L 28 / XL 36 px. A control appears when it fits at least one selected element; different values show as "Mixed".
- **Style panel** (full configuration), right side, floating:
  - opened with "All styles" or the toolbar button; closed with ✕;
  - draggable by its header, resizable from the left edge and bottom-left corner (width 240–520 px);
  - "snap back" button once moved.
  - Sections: stroke, background, fill style, stroke width, stroke style, look, corners, opacity, layers, copy/paste style, use as default, delete. Text: font with live previews, size steps + exact px, alignment.
  - With nothing selected the panel edits the **defaults for new shapes** and says so.
- Bar and panel edit the same state and always agree.

## Selection
Thin solid accent outline (1.25 px) with a small gap around the element, 8 px rounded white corner handles, a rotate handle above, and a size badge below (e.g. `220 × 120`). The rotate handle appears once rotation is in scope (not in the MVP). Dragging a corner handle resizes; dragging an outline side resizes that axis only (the sides have no drawn handle). Shift keeps proportions, and dragging past the opposite side flips the selection.

## Visual tokens
**Typography:** UI in Manrope. Canvas fonts: Hand (Caveat), Sans (Manrope), Mono (JetBrains Mono). Caveat is bundled from Fontsource (OFL-1.1, ADR 0025); the other fonts' licences are checked when they are added.

**UI colours**
| Token | Light | Dark (Graphite) |
|---|---|---|
| canvas / page | `#F7F9F9` | `#141517` |
| surface | `#FFFFFF` | `#1C1E21` |
| raised / segment | `#EFF3F3` | `#2A2E33` |
| border | `#DCE4E3` | `#2F3337` |
| text | `#13201F` | `#ECEEF0` |
| muted text | `#4E5C5B` | `#A3A9B0` |
| accent | `#0F766E` | `#4FD1C5` |
| on accent | `#FFFFFF` | `#062420` |
| accent soft (selected) | `#E3F2EF` | `#1D3836` |
| danger | `#B42318` | `#F08A80` |

Dark mode is neutral grey; teal only marks what is active. Text colours meet WCAG AA contrast.

**Drawing palette** (8 strokes, 8 fills). Colours are stored as the light value and shown dark-adapted in dark mode, so a drawing reads well in both themes.
| Stroke | Light | Dark | | Fill | Light | Dark |
|---|---|---|---|---|---|---|
| Ink | `#1E1F22` | `#E4E6E8` | | None | — | — |
| Graphite | `#6B7280` | `#9AA1AA` | | Rose | `#F7E1DE` | `#3D2624` |
| Brick | `#C2453D` | `#F08A80` | | Sand | `#F9EBD6` | `#3B2F1F` |
| Amber | `#D9822B` | `#F0AE63` | | Sage | `#E2F0E5` | `#1F3427` |
| Green | `#3F8F5A` | `#6CC28A` | | Mist | `#DDF0EF` | `#183433` |
| Teal | `#1F8A8A` | `#5CC8C8` | | Sky | `#E0E9FB` | `#1F2C45` |
| Blue | `#3A6FD8` | `#8AB0F5` | | Lilac | `#ECE6FD` | `#2C2545` |
| Violet | `#7A5AF8` | `#A895FB` | | Fog | `#EEF0F2` | `#2A2D31` |

**Shape:** radii 6–8 px (controls), 10–12 px (buttons, cards), 14 px (panels, dialogs). Floating elements use a soft two-layer shadow. Touch/click targets ≥ 40 px, tool buttons 44 px.

## Logo and icons
- **Logo:** "scribble tile". A rounded teal square (`#0F766E`, radius 11/40) with one white pen stroke, followed by the wordmark **Yodo** in Manrope ExtraBold. In dark mode the tile turns `#4FD1C5` with a `#062420` stroke. The tile alone is the favicon.
- **UI icons:** **Phosphor** (Regular weight; Fill for active states). Added in roadmap 1.10 as `@phosphor-icons/react` (ADR 0028).
- **Folder icons:** each folder gets a line icon from the same set plus one of the 8 drawing-palette colours, chosen in an icon + colour picker. Default: folder icon, Graphite. No emoji.

## Not decided here
- Exact keyboard shortcuts (per feature).
- Phone and tablet layouts (MVP is desktop, `docs/product.md`).
- Text styles (Title, Heading…) and style presets — explored in round 2, not adopted.
- Export to `.excalidraw` (ADR 0014: import only).
