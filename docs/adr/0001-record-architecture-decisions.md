# 0001. Record architecture decisions as ADRs

- Status: Accepted
- Date: 2026-10-30

## Context
Yodo is a learning and portfolio project built with Claude Code. Conversations are lost after `/clear`, so the reasoning behind technical choices must live in files. A single editable decisions log loses history when decisions change.

## Decision
Record every architecturally significant decision as an Architecture Decision Record in `docs/adr/`, using the Nygard format plus an "Alternatives considered" section (see `0000-template.md`).

- Files are numbered `NNNN-short-title.md` and never renumbered.
- Accepted ADRs are not rewritten; a changed decision gets a new ADR and the old one is marked `Superseded by NNNN`.
- Typo and naming fixes, and clarifications that make a decision more precise without changing it, may be edited in place and are noted with an `Amended: YYYY-MM-DD — what` line under the status.
- `docs/adr/README.md` keeps the index.

## Alternatives considered
- **Single `docs/decisions.md`** — simple, but edits overwrite history and it grows hard to scan.
- **MADR** — more structured, but heavier than needed for most decisions; we borrow only its alternatives section.

## Consequences
- The "why" behind each choice is preserved and linkable from PRs and the project CLAUDE.md.
- Slight overhead: each new significant decision needs a short file.
