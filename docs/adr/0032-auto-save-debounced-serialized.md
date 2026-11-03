# 0032. Auto-save: debounced, one save at a time, flushed when the page hides

- Status: Accepted
- Date: 2026-11-03

## Context
Roadmap 1.14 adds auto-save: every change is saved without a Save button, and a drawing survives a reload in both modes (`docs/product.md`, Auto-save). Saves go through `DrawingRepository` ([0005](0005-browser-storage-indexeddb.md)), which is IndexedDB in hosted mode and HTTP in self-hosted mode ([0031](0031-storage-mode-detection-and-server-contract-tests.md)).

Forces:
- A drag changes editor state on every pointer move but the document only once, at pointer up ([0023](0023-undo-redo-document-snapshots.md)). Typing in the text editor isn't a document change until commit ([0027](0027-edit-text-in-textarea-overlay.md)).
- Over HTTP two saves in flight can finish out of order, so an older document could overwrite a newer one.
- The viewport is editor state, copied into `appState` on save ([0022](0022-viewport-is-editor-state.md)). `updatedAt` is the "last edited" time the Home screen shows (1.15).
- Closing or hiding a tab can lose a change still waiting for its timer.

## Decision
A framework-free auto-saver in `web/src/storage/autosave.ts` subscribes to the editor store and saves the whole document:
- **Trigger:** only a new `document` reference. Pan and zoom don't trigger a save; the current viewport is copied into `appState` on every save, so it rides along with the next change.
- **Debounce:** 1 second after the last change.
- **One save at a time:** a change made during a save waits for it, then the latest document is saved once. Saves never overlap, so they can't land out of order.
- **Flush:** on `visibilitychange` to hidden and on `pagehide` the pending save starts at once.
- **Status:** a store with `saved`, `unsaved`, `saving` or `error`, shown in the bottom bar. A failed save sets `error`; the next change retries.

Until the Home screen and its routes exist (1.15), startup opens the drawing with the latest `updatedAt`, or a new one if there is none.

## Alternatives considered
- **Save on every document change, no debounce.** Simplest, but a burst of quick changes (undo held down) sends one request each.
- **Also save on pan and zoom.** The view would always come back exactly, but `updatedAt` would move on every pan, so "last edited" would lie.
- **Let saves overlap and drop stale replies.** The client can't stop an older request from being written after a newer one on the server; serializing avoids that without server changes.
- **Remember the last open drawing in `localStorage`.** Bypasses the repository and doesn't follow the drawing across browsers in self-hosted mode.

## Consequences
- The document is rewritten whole on each save; fine for M1 sizes, revisit if drawings get large.
- The flush on `pagehide` is best-effort: the browser may end the page before an IndexedDB transaction or `fetch` completes, so up to the last change can be lost when a tab is closed within the debounce window. `visibilitychange` fires first in most browsers, which narrows that window.
- A pan with no later edit isn't restored after reload.
- Two tabs on the same drawing overwrite each other (last save wins); out of scope for M1.
