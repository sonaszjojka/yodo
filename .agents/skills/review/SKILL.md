---
name: review
description: Review a Yodo plan or branch diff for defects and report findings in a fixed format, without editing anything. Used by the /deliver pipeline's Codex reviewer workers, and by any agent asked to review Yodo work.
---

# Review

You are an independent reviewer. You didn't write the work, and you don't fix it. Your job is to find what is wrong before it reaches `main`.

## Rules
- **Read-only.** Don't edit, create, stage, commit, push or check out anything in the repo. You may read files, run `git log`, `git show` and `git diff`, and run the test, lint and type-check commands from `CLAUDE.md`. If a command leaves build output behind, that's fine; changes to tracked files are not.
- **The rules you judge against:** `CLAUDE.md`, `docs/conventions.md`, the ADRs in `docs/adr/` that the work touches, and `docs/ui.md` for anything visible. Cite the rule (e.g. "ADR 0002") when a finding is based on one.
- **Check before you report.** Read the actual code around every finding. Each finding needs a concrete failure scenario. "Might be an issue" isn't a finding.
- If the task can't be done (missing branch, unreadable plan), report that as the outcome instead of guessing.

## Plan review (adversarial)
You get a plan for a roadmap task. Argue against it and look for:
1. **Done-when gaps:** a "done when…" item the plan doesn't deliver, or one it can't prove (no test, no check).
2. **Rule conflicts:** with an ADR, the layering (`core/` imports no React, storage only through `DrawingRepository`), or the document format (a breaking change without a version bump and migration).
3. **A missing ADR:** an architectural choice the plan makes silently.
4. **Edge cases and failure modes** the plan ignores, in both usage modes (hosted IndexedDB and self-hosted HTTP).
5. **Test gaps:** behaviour without a test at the right level of the pyramid (ADR 0011).
6. **Scope creep, or a clearly simpler approach** that meets the same done-when criteria.

Severities: `blocker` (the plan fails a done-when item or breaks a rule), `major` (a likely bug or a missing test for a risky path), `minor` (worth considering).

## Code review
You get a branch and a commit range. Look for correctness bugs first:
- wrong results, crashes, data loss or corruption (storage, migrations, auto-save), broken undo/redo
- state that drifts between modes or between the document and the UI
- missing error handling on I/O, and security issues (auth, Host/Origin checks, injection; ADR 0020)
- a test that doesn't actually check what it claims

Then rule violations (as above), then cleanups.

Severities: `bug` (a correctness defect with a believable failure scenario), `rule` (breaks a project rule or ADR), `cleanup` (reuse, simplification, style; not blocking).

## Output
End with exactly this structure. It is what the coordinator parses:

```
OUTCOME: findings | clean | could-not-review
CHECKS RUN: <commands you ran and their result, or "none">
FINDINGS:
1. [<severity>] <file:line or plan section> — <one-sentence defect>
   Scenario: <input or state> → <wrong result>
   Evidence: <what you read or ran that shows it>
2. ...
```

Use `FINDINGS: none` when there are none. Don't pad the list. A short list of real findings beats a long list of maybes.
