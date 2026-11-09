# 0056. One Export button, with a Yodo file tab in the export dialog

- Status: Accepted
- Date: 2026-11-09

## Context
Roadmap 4.9 (issue #139). The editor's top right had two buttons with almost the same name: **Export** (downloads the `.yodo` file) and **Export image** (opens the PNG / SVG dialog; ADR 0041, 0043). The names do not say which does what, and the `.yodo` export had no options while the image dialog had many, so the two felt unrelated. A code comment promised the dialog would take the `.yodo` export over as a "Yodo file" tab, while `docs/ui.md` kept a separate button.

## Decision
One **Export** button (never disabled; Shift+Ctrl/Cmd+E) opens the export dialog, titled "Export", with three tabs: PNG, SVG and **Yodo file**. The Yodo file tab has no preview and no image options; it shows what the file holds, a file-name field and Download (no Copy). A drawing with nothing on it opens on the Yodo file tab, since images need elements.

The file-name field only names the download. It never changes the drawing's own name inside the file. The card menu's `Export as .yodo` on Home is unchanged: it exports a drawing without opening it.

No document, storage or server change.

## Alternatives considered
- **One Export menu listing the formats.** The image options still need a dialog, so there would be two surfaces.
- **Keep two buttons with clearer names and icons.** Still two places to look, and the `.yodo` export would stay unrelated to the others.

## Consequences
- One place to export; the shortcut, tooltip and accessible label all say "Export".
- A plain `.yodo` download takes two clicks (open, then Download) instead of one.
- Supersedes nothing; it settles the open question left by ADR 0041's "Export image" wording.
