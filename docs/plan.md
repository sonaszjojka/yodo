# Yodo: preparation before repositories and implementation

## Context
When this plan was written (2026-10-29), Yodo had a name and working tooling (git identity `sonaszjojka <sssjonasz4@gmail.com>`, `gh` logged in, SSH working), but no files and no global CLAUDE.md. Before any code exists, we want to settle **what** we're building, **with what**, and **how we work**. Then implementation can move in small, verifiable steps, and Claude has context it can't read from the code.

Rule: every stage ends with a **file of decisions**, not just a conversation. Conversations disappear after `/clear`; files stay and go into the repo.

**Language:** from now on all communication, code, docs and other output are in English.

## Status (2026-11-04)
Read this section, not the whole file; finished work is logged in `docs/history.md`.
- **Last done:** roadmap 2.2b (issue #96): the style panel's remaining sections. Corners (a new optional `roundness` field on rectangles and diamonds, non-breaking, so still schema v1), layers, copy/paste style and "use as default" in the panel, plus the bar's "more" menu for every selection.
- Open items: `review` issues from the 1.14, 1.15, 1.16, 2.2a and 2.2b reviews.
- **Next step:** roadmap 2.3 (issue #79): dark mode.

## Working mode: an educational project
The goal is both the app and learning how to program with Claude as effectively as possible, so that the knowledge stays with you. The rules (you decide and I explain, no silent automation, features introduced on first use, a short recap after each task, "just do it" to skip explanations) live in the global `~/.claude/CLAUDE.md` and the `educational-working-mode` memory, so they apply in every session.

---

## Part A: stages before the repositories

### Stage 0. Switch existing files to English
- Translate the project memory (`~/.claude/projects/-Users-jonaszsojka-Dev-yodo/memory/yodo-project.md`): replace "Converse in Polish" with "Communicate and write everything in English".
- Add a feedback memory with the educational working-mode rules (see Working mode above), and link it from `MEMORY.md`.
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
Finished stages and tasks are logged, oldest first, in `docs/history.md`. `/ship` appends there.
