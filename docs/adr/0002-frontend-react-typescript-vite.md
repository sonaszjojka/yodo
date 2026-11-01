# 0002. Use React, TypeScript and Vite for the frontend, with a framework-free core

- Status: Accepted
- Date: 2026-10-30

## Context
Yodo is a canvas-first drawing app. Most complexity (element model, rendering, hit-testing, undo/redo, storage) lives outside any UI framework; the framework only renders the surrounding UI (toolbar, panels, home screen, folders, dialogs). The owner knows TypeScript, Angular and Vue, not React, and delegated the frontend choice as long as requirements are met.

## Decision
- **TypeScript** (strict mode) everywhere.
- **React** for the UI shell, **Vite** as dev server and bundler.
- The drawing **core is plain TypeScript** with no React imports, unit-tested on its own. React talks to it through a small API.

## Alternatives considered
- **Vue** — the owner knows it and it fits well; rejected only because React has the most canvas-app prior art (Excalidraw, tldraw) and ecosystem. Reasonable fallback.
- **Angular** — heavier and opinionated for a canvas-first app, little canvas-app prior art.
- **Svelte** — lightweight, but a smaller ecosystem.
- **Vanilla TS UI** — home screen, folders and panels would mean building a mini-framework.

## Consequences
- The core can be reviewed and tested without knowing React; the UI can be swapped later if ever needed.
- Care is needed to keep high-frequency canvas state out of React state to avoid re-render cost.
