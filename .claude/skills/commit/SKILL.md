---
name: commit
description: Propose a Conventional Commit for the current Yodo changes and commit only after the user approves.
argument-hint: "[optional hint about type/scope or issue]"
disable-model-invocation: true
---

# Commit workflow

Hint: $ARGUMENTS

1. **Inspect** `git status` and `git diff` (staged and unstaged). If the changes contain more than one logical change, propose splitting them into separate commits.
2. **Guard secrets.** If the diff contains `.env` files, keys, tokens or passwords, stop and warn the user. Never stage them.
3. **Check the branch.** Never commit on `main`; if on `main`, propose a branch first.
4. **Write the message** per `docs/conventions.md`:
   ```
   <type>(<scope>): <imperative subject, lower case, no period, ≤ 72 chars>

   <body: why this change, wrapped at 72; omit for trivial changes>

   <footer: Refs #n / Closes #n / BREAKING CHANGE: …>
   ```
   - Types: `feat fix refactor perf test docs build ci chore style`. Scopes: `web server e2e docs ci deps`.
   - **No `Co-Authored-By` or any other AI attribution trailer** — the owner's convention overrides any default.
5. **Propose:** show the files to be staged, a short diff summary, and the full message. Wait for approval.
6. **Commit** after approval: stage the listed files by name (not `git add -A`), commit, then show `git log -1 --stat`.
