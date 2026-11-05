# AGENTS.md

Instructions for coding agents that don't read `CLAUDE.md` (for example Codex).

The project rules live in one place: **read [`CLAUDE.md`](CLAUDE.md) first and follow it as if it were this file.** It covers the commands, the architecture, and the ADR and convention rules. Its links lead to the rest (`docs/conventions.md`, `docs/adr/README.md`, `docs/ui.md`, `docs/roadmap.md`).

Shared skills for every agent are in `.agents/skills/`. Claude-only workflow skills are in `.claude/skills/`; other agents don't run them (ADR 0037).
