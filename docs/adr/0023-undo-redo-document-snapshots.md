# 0023. Undo and redo by keeping snapshots of the immutable document

- Status: Accepted
- Date: 2026-11-02

## Context
Every change from roadmap 1.2–1.6 (create, move, resize, delete) must undo and redo with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (`docs/product.md`). Later tools (pencil, text, eraser, style) must undo too. The editor state lives in a framework-free store with immutable snapshots (ADR 0021). Every drag already ends in exactly one new `document` reference, and camera moves never replace `document` (ADR 0022). So "a new document reference" already means "one user edit".

## Decision
History is a pair of stacks (past and future) holding whole `YodoDocument` references, written in `web/src/core/history/`. The editor subscribes to its own store. Whenever `document` gets a new reference that undo or redo did not cause, it records the previous one and clears the redo stack. Undo and redo swap the current document with the top of the other stack. The history keeps at most 100 steps and drops the oldest first.

- Undo or redo first cancels any drag in progress, so a preview is never applied to a restored document.
- The selection keeps only the elements that exist after the step. Selection, tool and viewport are not part of history.
- Whether undo and redo are available is kept in a small separate store (`editor.history`), so the UI can disable its buttons. Recording runs inside a store listener and must not call `setState` on the store that is notifying it.

## Alternatives considered
- **Command pattern** (each action records `do` and `undo`) — less memory, but every tool must write a correct inverse. An inverse that drifts from its action is a classic source of bugs, and it adds code to every future tool.
- **Patches or diffs** (immer patches or per-element diffs) — compact and a step towards sync, but it needs a dependency or our own diff code, and collaboration is out of scope.

## Consequences
- New tools get undo for free if they change the document in one `setState` when the gesture ends (as `draft`, `move` and `resize` do now). A tool that changed `document` on every pointer move would create one step per move.
- Unchanged elements are shared between snapshots (structural sharing), so a step costs about one elements array. That is fine for MVP-sized drawings; a very large drawing would hold up to 100 arrays.
- History lives in memory only: it is lost on reload and is not saved with the drawing.
- Loading another drawing (1.15) creates a new editor, and with it an empty history.
