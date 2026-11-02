# Yodo: preparation before repositories and implementation

## Context
When this plan was written (2026-10-29), Yodo had a name and working tooling (git identity `sonaszjojka <sssjonasz4@gmail.com>`, `gh` logged in, SSH working), but no files and no global CLAUDE.md. Before any code exists, we want to settle **what** we're building, **with what**, and **how we work**. Then implementation can move in small, verifiable steps, and Claude has context it can't read from the code.

Rule: every stage ends with a **file of decisions**, not just a conversation. Conversations disappear after `/clear`; files stay and go into the repo.

**Language:** from now on all communication, code, docs and other output are in English.

## Status (2026-11-02)
Read this section, not the whole file; finished work is in History at the end.
- **Last done:** roadmap 1.6 (issue #15): resize by corner handles and outline sides, Shift keeps proportions, flip past the opposite side, size badge.
- Open items: **undo/redo design** (ADR at roadmap task 1.7).
- **Next step:** roadmap 1.7 (undo/redo, issue #16); its ADR comes first.

## Working mode: an educational project
The goal is both the app and learning how to program with Claude as effectively as possible, so that the knowledge stays with you.
- **You decide, I explain.** For every decision (stack, conventions, structure) I show 2–3 options with pros and cons, plus my recommendation and why. You choose.
- **No silent automation.** I don't commit, create branches, push, install dependencies or change config without asking. I say what I want to do and why, then wait for your go-ahead.
- **I introduce each Claude Code feature the first time we use it** (plan mode, `/clear`, hooks, skills, worktrees, `/code-review`…): what it does, when it's worth using, when it isn't.
- **After each task, a short recap:** what I did, why that way, and what's worth learning from it.
- At any point you can say "just do it" or "show me how to do it by hand".
- These rules go into memory and into the global CLAUDE.md (Stage 1), so they apply in every session.

---

## Part A: stages before the repositories

### Stage 0. Switch existing files to English
- Translate the project memory (`~/.claude/projects/-Users-jonaszsojka-Dev-yodo/memory/yodo-project.md`): replace "Converse in Polish" with "Communicate and write everything in English".
- Add a feedback memory with the educational working-mode rules above, and link it from `MEMORY.md`.
- (This plan file is already in English.)

### Stage 1. Global CLAUDE.md (~10 min)
**You provide:** your preferences on top of what we've agreed (English everywhere, educational mode, asking before commits, branches, pushes and new dependencies).
**I do:** draft a short `~/.claude/CLAUDE.md` (15–20 lines). We go through it line by line, I explain how each line changes my behavior, and I save it once you approve.

### Stage 2. Product scope (MVP)
**You provide:**
- a feature list split into **MVP / later / never**. Starting point from memory: tools (rectangle, ellipse, arrow, line, pencil, text, select/move, eraser, undo/redo), rough.js hand-drawn style, home screen with auto-saved drawings, PNG/SVG export,
- what annoys you most in Excalidraw and what you like (screenshots welcome, you can paste them into the terminal),
- who it's for: just you, or other users with login some day.

**I do:** `docs/product.md` with the goal, the MVP with "done when…" criteria, and an out-of-scope list.

### Stage 3. Technical decisions
Done. Settled: frontend, rendering, storage in both usage modes, distribution, auth, Go server stack, SQL tooling, tests, repo layout and the drawing format. The outcomes are in `docs/adr/README.md`; the ADRs replace the original agenda that stood here.

**You provide:** what you want to learn or show in your portfolio (this strongly shapes the choices), and technologies you already know.
**I do:** one ADR per decision in `docs/adr/` (Nygard format + alternatives; see ADR 0001).

### Stage 4 (optional). UI mockup
A quick mockup in Claude Design (artifact) to settle the home screen and toolbar layout before writing code.
**You provide:** inspirations and preferences (minimalism, colors, dark mode).

### Stage 5. Roadmap in small tasks
**I do:** split the MVP into milestones and tasks of about one session each (e.g. "canvas + drawing a rectangle", "selecting and moving", "undo/redo", "saving to IndexedDB", "Go server serving the app", "SQLite storage behind the HTTP repository"…). Each task has a "done when…" criterion. Once the repo exists, they can become GitHub Issues.
The roadmap must cover both usage modes (ADR 0005–0008): the Go server, SQLite, the Docker image and the GitHub Pages deploy belong in M1, not in a later stage.

### Stage 6. Working conventions (you decide, I explain the options)
For each point I show examples and explain how teams handle it in practice:
- **commit format:** e.g. Conventional Commits (`feat: add rectangle tool`) versus free-form messages; whether to add `Co-Authored-By: Claude`,
- **branch naming:** e.g. `feat/rectangle-tool`, `fix/undo-crash`; a branch per task, or working directly on `main`,
- **flow:** PR + `/code-review` before merge (good practice and looks good in a portfolio), or local merges,
- **who does what in git:** I suggest that I prepare each commit (message + diff) and you approve it; push and merge only on your command,
- **definition of done:** tests pass, lint is clean, the change has been checked in the browser (screenshot).
- **license:** the repo is public and meant for self-hosting, so pick one (e.g. MIT, Apache-2.0, AGPL-3.0).

The result goes into `docs/conventions.md`, and later into the project CLAUDE.md.

---

## Part B: creating the repo (after stages 1–6; every step explained and done only with your approval)
1. `git init` in `~/Dev/yodo` (it becomes the monorepo, `docs/` is already in place) and `gh repo create sonaszjojka/yodo --public` (public is required for free GitHub Pages, ADR 0007). Scaffold `web/` (Vite + React + TS) and `server/` (Go module) per ADR 0012. I explain what the scaffold generates and what each file is for.
2. Working `npm run dev`, `npm test`, `go test ./...`, `sqlc generate`, lint and formatters for both TypeScript and Go.
3. `/init`, then extend the project CLAUDE.md with the decisions and conventions from stages 3 and 6, including the rule to record every architectural decision as an ADR.
4. Claude configuration: a format-on-edit hook, an allowlist of safe commands (`/fewer-permission-prompts` after a few days). CI in GitHub Actions with path filters for `web/` and `server/`, the GitHub Pages deploy and the Docker image push to GHCR (ADR 0007).
5. Skills only once something repeats (candidates: `run` to launch the app and take a screenshot, `add-tool` for adding a new canvas tool). Deliberate exception: the workflow skills (`feature`, `fix`, `commit`, `ship`, `adr`) were written in Stage 6 because the flow was already decided; adjust them after the first few tasks.

---

## Part C: how Claude works best (cheat sheet)

| Situation | What you give me | What you get |
|---|---|---|
| Session start | one goal for the session ("today: undo/redo") | focused work that doesn't drift |
| New feature | a "done when…" criterion, an example or screenshot, constraints | a plan (plan mode, `Shift+Tab`), then after approval code + test + verification |
| Bug | repro steps, expected vs. actual behavior, error or screenshot | a diagnosis of the cause, a fix, and a test that catches it |
| Visual work | a screenshot or reference pasted into the terminal | a change checked in the browser |
| Correction | a concrete "not X, because Y" | it's remembered for future sessions |

Session hygiene:
- `/clear` between unrelated tasks, because stale context gets in the way,
- plan mode for anything bigger than a small fix,
- one terminal with Claude, a second one for the dev server; parallel sessions and worktrees only once frontend and backend work run in parallel,
- lasting knowledge goes into files (`docs/`, CLAUDE.md), not only into the conversation.

---

## Part D: sessions, context and commands (quick reference)

**The task loop:** `/clear` → state one goal → plan mode (`Shift+Tab`) → approve the plan → implement → verify → review the diff (`git diff` / IDE) → commit → `/clear`.

| When | Use |
|---|---|
| Starting a new, unrelated task | `/clear` (default choice; CLAUDE.md and memory reload) |
| Mid-task, context getting full | `/compact <what to keep>` |
| Checking how full the context is | `/context` |
| Coming back after closing the terminal | `claude -c` (last session) or `claude --resume` / `/resume` |
| I went the wrong way | `Esc` to stop, `Esc Esc` / `/rewind` to go back to an earlier point |
| Switching mode (normal / accept edits / plan) | `Shift+Tab` |
| Pointing at a file / showing a screenshot | `@path/to/file` / paste the image |
| Running a shell command into the conversation | `! command` |
| Editing what I remember | `/memory` |
| Seeing diffs in the editor | `/ide` (VS Code / JetBrains) |

Signs it's time to `/clear`: the task is done, I repeat a mistake you already corrected, or I "forget" earlier instructions.

Multiple sessions: one main session plus a second for side questions or research, so the main context stays clean. Parallel coding sessions only with separate git worktrees, once frontend and backend work run in parallel.

---

## Verification
Preparation is finished when these exist: an English project memory plus a working-mode feedback memory, a global CLAUDE.md, `docs/product.md` (MVP with criteria), ADRs in `docs/adr/` (stack + storage + reasoning), a roadmap with the first 5–10 tasks, and written conventions. Then we move on to Part B.

---

## History
One dated line per finished stage or task, oldest first. `/ship` appends here.
- Done: tooling (git identity, `gh`, SSH); this plan approved; a Polish Claude Code usage guide saved to the user's Obsidian note `Working with Claude - YODO.md`.
- Done: Stage 0. Project memory is in English and points to this plan; the `educational-working-mode` feedback memory has been added.
- Done: plan moved from `~/.claude/plans/` to `~/Dev/yodo/docs/plan.md`.
- Done (2026-10-30): Stage 1. Global `~/.claude/CLAUDE.md` written: English, educational mode (global), concise replies + why, save corrections, ask-before list, secrets guard, small steps. "Verify before done" deliberately left for Stage 6's definition of done.
- Done (2026-10-30): Stage 2. `docs/product.md` approved: local-first web app (desktop, mouse/trackpad), MVP in milestones M1–M3, done-when criteria per feature, performance target, later/never lists. Version history moved to later.
- Done (2026-10-30): Stage 3. Decisions are ADRs in `docs/adr/` (index in `docs/adr/README.md`), replacing `decisions.md`. Summary: React+TS+Vite with a framework-free core; Canvas 2D + rough.js; two usage modes (GitHub Pages with IndexedDB, Docker with a Go server + SQLite on disk, already in the MVP; product.md gained "Usage modes"); auth none hosted / localhost + optional `YODO_PASSWORD`; Go stdlib `net/http`; sqlc + modernc SQLite + embedded goose; test pyramid with repository contract tests; one monorepo `sonaszjojka/yodo` (`web/`, `server/`, `e2e/`, `docs/`). Rules "best practices at every stage" and "ADR for every architectural decision" are in the global CLAUDE.md; copy the ADR rule into the project CLAUDE.md in Part B.
- Done (2026-10-30): Stage 3 review. Fixed: ADR 0008 allowed origins (`YODO_ALLOWED_ORIGINS`) + missing-`Origin` rule; 0007 container listen address; 0001 allows amendments in place; performance benchmark added to product.md. ADR 0013 (versioned document format, opaque JSON on the server) accepted.
- Done (2026-10-30): Stage 4. UI direction approved in `docs/ui.md` (mockup on a claude.ai design canvas, page "Final"): canvas-first editor with a contextual style bar above the selection plus a movable, resizable style panel on the right; sidebar Home with a "+ New drawing" tile and ⋯ / right-click card menus; Trash, Search, Export, Shortcuts and password screens; teal light theme + neutral Graphite dark theme; drawing palette with dark-adapted colours (ADR 0015); scribble-tile logo; Phosphor icons; folders with icon + colour. Also decided: import `.excalidraw` files via a one-way converter (ADR 0014).
- Done (2026-10-30): Stage 5. `docs/roadmap.md` approved: walking skeleton first, so M0 = Part B (scaffold, CI, Pages deploy, Docker image, Host/Origin checks), then M1 (draw + save in both modes + Home), M2 (styles, dark mode, images, export/import incl. Excalidraw, password, perf benchmark), M3 (folders, trash, search, attached arrows, v1.0.0).
- Done (2026-10-30): Stage 6. `docs/conventions.md` approved: Conventional Commits without AI attribution trailers, GitHub flow (branch per task, PR, CI, `/code-review`, squash-merge to protected `main`), definition of done, MIT license. Workflow skills written in `.claude/skills/` (`feature`, `fix`, `commit`, `ship`, `adr`).
- Done (2026-11-01): Part B step 1 (= roadmap 0.1). Repo `sonaszjojka/yodo` created (public, MIT); `web/` (Vite + React + TS strict, placeholder page with the logo) and `server/` (Go module stub) merged in PR #1. Also decided: TypeScript lint with oxlint (ADR 0016). `main` is protected on GitHub (squash merge only, ruleset "Protect main"), and `/code-review --comment` findings are triaged into fixes, `review` issues or replies (`docs/conventions.md`).
- Done (2026-11-01): roadmap tasks for M0 and M1 are GitHub Issues #6–#25, grouped in milestones M0–M3 and linked from `docs/roadmap.md`. M2 and M3 issues are created when M1 ends.
- Done (2026-11-01): Part B step 2 (= roadmap 0.2): Prettier, golangci-lint, Vitest + go test smoke tests, sqlc via `go tool`, Node 24, project CLAUDE.md (ADR 0017). Review now runs on the branch before `/ship`, one `low` round; `/ship` syncs docs into the PR.
- Done (2026-11-01): Part B step 3 (= roadmap 0.3): one CI workflow with path filters and a `ci` gate job as the required check, Pages deploy on merge, actions pinned by SHA (ADR 0018).
- Done (2026-11-01): Part B step 4 (= roadmap 0.4): Go server serves the embedded web app and `/api/health`; multi-stage Dockerfile on distroless nonroot; CI builds amd64+arm64 on PRs and pushes `ghcr.io/sonaszjojka/yodo` from `main` (ADR 0019); root README with the `docker run` command.
- Done (2026-11-01): Part B step 5 (= roadmap 0.5): Host/Origin middleware against CSRF, cross-site WebSocket hijacking and DNS rebinding; `YODO_ALLOWED_ORIGINS` validated at startup; review widened the rule to check `Origin` whenever present and deny unlisted methods (ADR 0020 supersedes 0008). M0 complete.
- Done (2026-11-01): roadmap 1.1: v1 document and M1 element types in `web/src/core/document/`; `loadDocument` → `migrate` (envelope checks, refuses newer versions) → migration chain. Review added per-step and post-migration validation and an ID fallback for non-secure contexts (ADR 0013 amended).
- Done (2026-11-01): roadmap 1.2: full-window HiDPI canvas; rough.js rectangle with a seed fixed at pointer-down; Shift squares, live mid-drag; Escape cancels; editor state in a framework-free store (ADR 0021). Review: only the pointer that starts a drag drives it.
- Done (2026-11-01): roadmap 1.3: pan (hand tool H, Space, middle-drag, wheel) and pinch / Ctrl+wheel zoom around the cursor; zoom control with reset (click, Ctrl/Cmd+0); viewport in editor state (ADR 0022). Review: wheel zoom capped at 1.25× per event, stored zoom clamped on load, zoom gestures caught on `window` so pinching over the UI never zooms the page.
- Done (2026-11-02): roadmap 1.4: diamond (D), ellipse (O), line (L) and arrow (A) through one draw tool; Shift squares box shapes and snaps lines to 15°; lines keep their start as (x, y) with relative points; core hitTest for every element type (transparent shapes hit only near the outline). Review: lines and arrows with fewer than two points render without throwing.
- Done (2026-11-02): roadmap 1.5: select tool (V/1, the default) with topmost click, Shift+click toggle and box select of fully enclosed elements; a move is a preview offset committed on release (one document change); Delete/Backspace; drawing selects the new shape and switches to Select; overlay outline clears the stroke's rough wobble and keeps its screen size at any zoom. Review: stroke hits beat a selected shape's empty box, a tool picked mid-draw is kept, Delete mid-box removes what is highlighted, box select waits for the drag threshold.
- Done (2026-11-02): roadmap 1.6: resize by corner handles and outline-side zones (one or many elements, around the opposite side); Shift keeps proportions; dragging past the opposite side flips; a preview committed on release (one document change); size badge under the selection, drawn in screen px. Review: a side keeps at least 1 unit, handle zones reach at most a quarter inward so small selections still move, a flat line's zero-size axis does not grab, a click on a handle zone still selects, the cursor follows flips. Code review minimum raised to `medium`.
