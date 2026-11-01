# Yodo — Product Scope

> Status: **approved 2026-10-30** (Stage 2 of `docs/plan.md`); usage modes, benchmark and milestone draft updated 2026-10-30 after the Stage 3 decisions (`docs/adr/`). Detailed behaviour of each feature is defined later, feature by feature; the "done when…" criteria below are the minimum bar.

## Goal
A full, local-first Excalidraw-style drawing app. For me, my colleagues, and anyone who finds Excalidraw's free tier too limited and wants to run their own copy.

## Audience
- Local-first: drawings live on the user's machine; no accounts in the MVP.
- Should be easy for others to run themselves (see ADR 0007).

## Usage modes
| | Hosted (GitHub Pages) | Self-hosted (Docker) |
|---|---|---|
| Purpose | Try it instantly, quick sketches | Real everyday use |
| Data lives | In the browser (IndexedDB) | On disk, in a Docker volume (small Go server + SQLite) |
| Survives clearing browser data | No (export a Yodo file to be safe) | Yes |
| Same drawings across browsers | No | Yes |
| Login | None | None by default; optional password (ADR 0020) |

Moving drawings between the two modes is done with Yodo file export / import.

## Principles (from Excalidraw)
**Keep:**
- Hand-drawn look (rough.js)
- Minimal UI — canvas first
- Instant start — no signup, no setup, open and draw
- Speed and feel — fast, responsive, single-key shortcuts

**Fix:**
- No drawing management → home screen, auto-save, folders, trash, search
- Big boards get slow → performance with many elements / images is a first-class requirement

## Platform
- Web app running in the browser, available hosted (GitHub Pages) and self-hosted (Docker image with a small local server); see Usage modes. Could be wrapped as a PWA or desktop app later.
- MVP targets desktop with mouse / trackpad.

## MVP
Shipped in usable milestones; the split into milestones and tasks is in `docs/roadmap.md`.

### Canvas tools
| Feature | Done when… |
|---|---|
| Hand tool | Dragging with the hand tool (or holding Space) pans the canvas; elements don't move. |
| Selection ("marking") | Click selects one element, Shift+click adds to the selection, drag on empty space selects everything inside the box; selected elements can be moved, resized and deleted. |
| Rectangle, diamond, circle | Click-drag draws the shape at the dragged size; Shift keeps proportions (square / perfect circle). |
| Arrow, line | Click-drag draws a straight line; the arrow has an arrowhead at the end. |
| Pencil | Freehand strokes follow the cursor smoothly and can be selected and moved as one element. |
| Text | Click places a text box and starts typing; double-click edits existing text; text can be placed inside shapes. |
| Sticky notes | A coloured note with text that can be placed, moved, resized and edited like in Miro. |
| Eraser | Dragging over elements removes them; undo brings them back. |
| Undo / redo | Every change (create, move, resize, style, delete) can be undone and redone with Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. |

### Canvas features
| Feature | Done when… |
|---|---|
| Infinite canvas + zoom | Pinch / Ctrl+wheel zooms around the cursor and the wheel pans; there are no canvas edges; zoom level is visible and can be reset. |
| Keyboard shortcuts | Every tool has a single-key shortcut, plus Delete, copy/paste, undo/redo, select all; a shortcut list is viewable in the app. |
| Attached arrows | An arrow drawn from/to a shape stays connected when either shape is moved or resized. |
| Style controls | Selected elements can change stroke colour, fill colour, stroke width, and hand-drawn vs clean look. The full set of controls and where they live is in `docs/ui.md`. |
| Copy / paste + images | Elements can be copied, pasted and duplicated, also between drawings; an image from the clipboard is pasted onto the canvas. |
| Export PNG / SVG | The whole drawing or the selection exports to PNG and SVG, with or without background. |
| Dark mode | UI and canvas switch between light and dark; the choice is remembered; drawing colours are shown dark-adapted, so a drawing reads well in both themes (ADR 0015). |

### Managing drawings
| Feature | Done when… |
|---|---|
| Home screen | Shows all drawings with thumbnail, name and last-edited date, sorted by recent (can also sort by name or creation date); drawings can be created, opened and renamed. |
| Auto-save | Every change is saved without a Save button; a drawing survives closing and reopening the browser. In the self-hosted version it also survives clearing browser data and is the same in every browser. |
| Folders | Drawings can be created in or moved into folders; folders can be created, renamed and deleted; each folder has an icon and a colour chosen by the user. |
| Trash | Deleting a drawing moves it to Trash; it can be restored or permanently deleted; Trash can be emptied. |
| Search | Searching finds drawings by name and by text on their canvas. |
| Import / export file | A drawing exports to a `.yodo` file (ADR 0013) and importing that file recreates it exactly, also files from older Yodo versions. |
| Import Excalidraw file | Importing a `.excalidraw` file creates a new Yodo drawing with its shapes, text, arrows, pencil strokes and images; anything Yodo can't represent is listed in a short summary after import (ADR 0014). |

### Performance (non-functional)
- Panning, zooming and drawing stay smooth on a board with ~1,000 elements and several images.
- Benchmark: a generated reference board (1,000 mixed elements: shapes, arrows, pencil strokes, text; plus 5 images of ~2 MP) keeps panning and zooming at **≥ 55 fps** and draws a new shape with **no frame over 32 ms**, in Chrome on an Apple-silicon Mac. Measured by a Playwright performance test, tracked over time rather than gated on every CI run (CI machines vary).

## Later
- Real-time collaboration
- User accounts and a shared multi-user server (PostgreSQL; ADR 0006, 0020)
- Sync between the browser and a server (local-first sync)
- Snapping / alignment guides
- Version history: automatic snapshots + manually named versions; preview and restore (design already agreed)
- Tablet / touch / stylus support
- Installable PWA / offline, desktop app wrapper

## Never
- Required account to draw
- Ads, analytics or tracking
- Paid tiers or paywalled features
