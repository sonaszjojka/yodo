# 0027. Edit text in an HTML textarea over the canvas

- Status: Accepted
- Date: 2026-11-02

## Context
Roadmap 1.9: "Click places a text box and starts typing; double-click edits existing text" (`docs/product.md`). Typing needs a caret, selection, clipboard, IME composition (accents, CJK), spell-check and screen-reader support. The canvas has none of these. The core must stay free of React and the DOM (ADR 0002), and the editor state lives in the framework-free store (ADR 0021).

## Decision
While text is being edited, the UI shows a `<textarea>` over the canvas, matched to the text's font, size, zoom and position. The canvas skips that text while the textarea shows it.

- The core owns the editing session: `editing` in the editor state holds which text or label is edited and the current text. The textarea is a controlled view of it. Committing is one document change (one undo step, ADR 0023).
- Committing happens on blur, Escape, Ctrl/Cmd+Enter, or a press anywhere on the canvas. Enter adds a line. Empty text is discarded: a new text is dropped, an existing one is deleted, a label is removed.
- Text layout (line breaks, wrapping, size) is a pure core function that takes a `measure(text, font)` callback. The canvas renderer, the textarea and the editor share it, and tests pass a fake measure.
- Undo inside the textarea is the browser's own; canvas shortcuts are ignored while it has focus.

## Alternatives considered
- **Editing drawn on the canvas** (caret and selection painted by the core, keys from a hidden input). Full visual control, but caret movement, selection, IME and clipboard would all have to be rebuilt, and accessibility would be worse.
- **`contenteditable`.** Rich-text features Yodo doesn't need, plus browser differences in the HTML it produces.

## Consequences
- IME, spell-check, clipboard and accessibility come from the browser.
- The textarea and the canvas must lay text out identically (font, line height, alignment). The shared layout function and CSS that mirrors the canvas settings keep them in step, and a visual e2e test (1.16) can catch drift.
- `createEditor` takes a `measure` function, so the core can size text without a DOM.
