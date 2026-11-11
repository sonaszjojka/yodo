# 0067. Serialize file-backend writes across processes with a short lock file

- Status: Accepted
- Date: 2026-11-11

## Context
ADR [0064](0064-file-backend-for-the-mcp-server.md) makes `FileDrawingRepository`'s revision check and write one step only within a process, through an in-process queue, and leaves "a cross-process lock when 5.6 adds write tools" as a follow-up. With the write tools (ADR [0066](0066-agent-element-spec-for-mcp-write-tools.md)), the gap is real: every Claude Code, Claude Desktop or Cursor session starts its own stdio server, so two processes often share `YODO_MCP_DIR`. Both can read revision 1, pass the check and rename their file into place. The second rename silently wins, which breaks ADR [0062](0062-revision-counter-and-if-match-for-safe-concurrent-saves.md)'s promise that a save never overwrites a version it didn't see. Codex code review of 5.6 reproduced it with two repository instances.

## Decision
Every operation that writes the directory (`save`, `trash`, `restore`, `emptyTrash`, `delete`) holds a **directory-wide lock file**, `<YODO_MCP_DIR>/.lock`, from its revision check through its last rename. Reads take no lock: renames are atomic, and a crash between two renames is already covered by ADR 0064's "Trash wins".

- **Acquire** by writing the holder's JSON (a random token, the pid, the host name and the time) to a file of its own, then `link`ing it to `.lock`. The link fails if `.lock` exists, so a lock is created exclusively and is never seen half written.
- **Busy:** if the lock exists, retry every 25 ms for up to 5 s. After that the call fails with an error saying that another Yodo MCP process is writing and the call should be retried. A write takes milliseconds, so waiting is rare.
- **Stale:** a lock is taken over when its process is gone (same host, and `process.kill(pid, 0)` reports no such process) or when it is older than 30 s. An unreadable lock can only be a corrupt leftover, so it is judged by its file time against the same 30 s; a waiter's own timeout never makes a lock stale. The takeover renames the lock to a unique name, then deletes it.
- **Release** deletes `.lock` only if it still holds this process's token, so a process never removes a lock that someone else took over.
- The in-process queue stays, so calls in one process still run in order and never contend with each other.

## Alternatives considered
- **One writer per directory**, with a lock held for the process's lifetime — simpler, with no per-write timing. Rejected: a second agent session couldn't draw, and that's the common setup.
- **Re-check the revision just before the rename** — no lock file, but it only narrows the race; it doesn't close it.
- **`flock`/`fcntl` advisory locks** — the OS releases them when a process dies, so there are no stale locks. Rejected: Node has no built-in API for them, and a native dependency for this isn't worth it (ADR 0061 keeps runtime dependencies minimal).
- **Defer it to a later task** — rejected: `main` would carry a known lost-write bug.

## Consequences
- Two processes writing the same drawing now behave as ADR 0062 requires: one save wins, and the other gets `RevisionConflictError`, which the tools turn into "re-read and retry".
- Taking over a stale lock has a narrow race: two processes that judge the same lock stale at the same moment. It needs a crash first and then simultaneous writers, and the outcome is two writers, which is the behaviour before this ADR. This is accepted.
- On a network file system, `link` is only as atomic as the server makes it; `YODO_MCP_DIR` is meant to be a local folder (ADR 0064).
- `.lock` isn't a `.yodo` file, so listings already ignore it.
