# 0021. Keep editor state in a framework-free store, read by React through `useSyncExternalStore`

- Status: Accepted
- Date: 2026-11-01

## Context
The editor needs one place for its state: the document being drawn, the active tool, and the shape being dragged. Pointer moves change it many times per second. ADR 0002 keeps the core free of React and warns against putting high-frequency canvas state in React state. Undo/redo (roadmap 1.7) and auto-save (1.14) will need to observe every change, without depending on React.

## Decision
A small generic store written in `web/src/core/` (`getState`, `setState`, `subscribe`), with immutable state snapshots. The canvas subscribes to it directly and redraws in `requestAnimationFrame`. React components read slices of it through a `useStore(store, selector)` hook built on React's `useSyncExternalStore`, so they re-render only when their slice changes.

## Alternatives considered
- **Zustand (`zustand/vanilla`)** — almost the same API and adds devtools, but it is a dependency for about 40 lines of code, and the core would depend on it. Easy to switch to later because the shape matches.
- **React state (`useReducer` + context)** — the document would live in React. Every pointer move would re-render the tree, and undo/redo would be tied to React, which goes against ADR 0002.

## Consequences
- Store logic and tools are unit-tested without React; undo/redo and auto-save can subscribe to the store.
- Selectors must return stable values (the same reference when nothing changed). Otherwise `useSyncExternalStore` re-renders on every update.
- State is replaced, never mutated in place, so a change is visible as a new reference.
