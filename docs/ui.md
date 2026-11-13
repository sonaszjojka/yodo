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
| Home | Left sidebar: logo, **New drawing**, **Import file** (`.yodo` or `.excalidraw`, ADR 0014; for now one **Import file** button in the toolbar row that picks the format by the file's extension), All drawings, Folders, Trash (link with its count; the route is `#/trash`, ADR 0046). **Folders** lists each folder with its icon in its colour, name and drawing count; **+** creates one in an icon + colour dialog, and the ⋯ menu edits (name, icon, colour) or deletes it, which moves its drawings to Trash after a confirmation that states how many (ADR 0046). A folder is the route `#/f/<id>`; the title shows its name and a new drawing is created inside it. The **sidebar footer** holds the settings: a Theme segmented control of three icons (System / Light / Dark; arrow keys move and select) and a **Keyboard shortcuts** button; the editor follows the theme without a control of its own, and About joins the footer later. Main area: the title on its own row, then a toolbar row: search box on the left (capped width; not in Trash; searches the drawings the view lists, so inside a folder only that folder; Esc clears it), and Import file and Sort by on the right, wrapping under the search when narrow; card grid that starts with a **"+ New drawing" tile**. |
| Drawing card | Thumbnail, name, folder icon + name, last edited. **⋯ button and right-click** open the same menu: Open, Open in new tab, Rename, Duplicate, Move to folder (a second menu page listing the folders and No folder), Export as `.yodo`, Move to Trash (no confirmation: it can be restored). The menu opens upwards from the card, or downwards when there is no room above. |
| Editor | Top: menu/back + drawing name (left), tool toolbar (centre), style-panel toggle + one Export button (right; opens the export dialog, ADR 0056). Bottom: undo/redo, zoom, hint, save status, shortcuts. Contextual bar above the selection; style panel on the right. A drawing tool stays active after each element and `Esc` or `V` returns to Select (ADR 0050). The Text tool always makes free text, even over a shape; a shape's label is edited by double-click or Enter on the selected shape (ADR 0051). Changes saved elsewhere (another tab, device or agent; ADR 0062): on focus, a newer stored version replaces the editor's, with an info notice "Updated with changes made elsewhere." and a fresh undo history. When a save finds a newer version, the local one is saved as "‹name› (conflicted copy)" in the same folder, the stored version opens, and the notice "This drawing was changed elsewhere. Your version was saved as a copy." offers **Open copy**; if the copy can't be saved, an error notice says so, and the editor keeps the local version and retries. Notices are info (text colour) or errors (danger colour). |
| Trash | Sidebar as on Home. A small bar directly above the list: count + **Empty trash** (with confirm dialog). The bar also says drawings are deleted forever after 30 days. Rows: name, "Deleted …", Restore (icon + label), delete forever (icon only, with a confirm dialog: an irreversible one-click action is too risky). Opening a drawing from Trash isn't offered. |
| Search results | Replace the card grid (and its "+ New drawing" tile) while the box has text. Split into "In names" (cards, with the usual card menu) and "In text on the canvas" (rows: name and a one-line snippet with the match highlighted; a row opens the drawing). A drawing can be in both. The text section says "Searching…" until the index arrives, and "Text on the canvas couldn’t be searched." if it fails; names still work. No matches shows "No drawings match “…”.". Matching is case-insensitive and literal (ADR 0047). |
| Export dialog | Opened by the one `Export` button (top right; Shift+Ctrl/Cmd+E; never disabled). Tabs PNG / SVG / Yodo file (ADR 0056); an empty drawing opens on Yodo file. PNG and SVG: scope (whole drawing or selection), background on/off, dark version, scale (PNG only), file name, Copy / Download. The preview is exactly what you get: the canvas for PNG, the generated SVG in an image for SVG. SVG Copy puts the source text on the clipboard; the file embeds the fonts it uses (ADR 0043). Yodo file: no preview or image options, a one-line description, a file name (names the download only) and Download. |
| Keyboard shortcuts | Modal with search, grouped (Tools, Editing, View). Opens from the editor's bottom bar, the `?` key, and the button in Home's sidebar footer. A Drawings group joins when a drawing-level shortcut exists. |
| Open link | The route `#/open/<data>`, a drawing carried in the link (ADR 0069). Centred like "Drawing not found": "Opening link…" while it's read, then **Open this drawing?** with the drawing's name and element count, "It will be added to your drawings as a new copy.", **Open** (primary) and **Cancel**. Nothing is stored before Open. Open imports it as a new drawing and opens it in place of the link (Back doesn't return to the link); both buttons are disabled meanwhile, and a failure shows under the buttons with Open still available. Cancel goes to Home. A bad, cut-off or over-long link shows "Couldn’t open this link" with the reason and **Back to Home**. |
| Password screen | Self-hosted only, when `YODO_PASSWORD` is set (ADR 0020): password, "Remember this browser" (off by default), Unlock, clear error state (wrong password, too many attempts, server unreachable). If the session ends while a drawing is open, the same card appears as a dialog over the drawing, which stays untouched and inert until the password is entered. |

## Editing styles
- **Contextual bar** above the selection:
  - shape: stroke, fill, width, look (hand-drawn / clean), **All styles**, more;
  - text: font, size S/M/L/XL, **All styles**, more;
  - arrow: the shape controls plus **Start head** and **End head**, each a popover of none and the 14 heads (arrow, bar, circle, triangle, diamond and the crow's-foot ones), drawn as a line ending in that head; the panel has the same two sections before Opacity (ADR 0055);
  - note (sticky note, tool `N`): text colour and note colour (the 7 fills, never "None"), **All styles**, more; opacity in the panel. A new note is Sand and opens for typing at once (ADR 0038);
  - more (any selection): duplicate, copy/paste style, bring to front, delete.
  - Each control opens one small popover at a time. No bar when nothing is selected.
  - Steps: width Thin 1 / Bold 2 / Extra bold 4 px; look Hand-drawn (roughness 1) / Clean (0); size S 16 / M 20 / L 28 / XL 36 px. A control appears when it fits at least one selected element; different values show as "Mixed".
- **Style panel** (full configuration), right side, floating:
  - opened with "All styles" or the toolbar button; closed with ✕;
  - draggable by its header, resizable from the left edge and bottom-left corner (width 240–520 px);
  - "snap back" button once moved.
  - Sections: stroke, background, fill style (only while a selected shape that has one has a background, since "None" leaves nothing to fill; a note's colour doesn't count, as its paper ignores fill style), stroke width, stroke style, look, corners, opacity, layers, copy/paste style, use as default, delete. Text: font with live previews, size steps + exact px, alignment.
  - With nothing selected the panel edits the **defaults for new shapes** and says so.
- Bar and panel edit the same state and always agree.

## Selection
Thin solid accent outline (1.25 px) with a small gap around the element, 8 px rounded white corner handles, a rotate handle above, and a size badge below (e.g. `220 × 120`). The rotate handle appears once rotation is in scope (not in the MVP). Dragging a corner handle resizes; dragging an outline side resizes that axis only (the sides have no drawn handle). Shift keeps proportions, and dragging past the opposite side flips the selection. **One selected line or arrow** has no box, corner handles or badge: it has a round handle on each point instead, and a hollow mid-handle on a straight one; dragging the mid-handle bends it into a curve (ADR 0053). Dragging an end moves just that end; over a shape it snaps to the outline and attaches, over a line or another arrow it snaps to the path and attaches at that point (ADR 0054), anywhere else it detaches (ADR 0052). While an arrow end is being placed, and while the Arrow tool hovers over a shape, line or arrow, that target is outlined in the accent colour, along its own outline or path.

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
