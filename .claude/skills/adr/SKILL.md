---
name: adr
description: Record a Yodo architectural decision as an ADR in docs/adr — use whenever a choice affects structure, data format, dependencies, storage, APIs or tooling, or when the user runs /adr.
argument-hint: <decision to make or record>
---

# ADR workflow

Decision: $ARGUMENTS

1. **Check existing ADRs** in `docs/adr/README.md`. If an accepted ADR already covers this, say so. If the new decision changes it, this ADR will supersede it.
2. **Present options** (2–3) with pros/cons and a recommendation, naming the industry practice behind it. Wait for the user's choice — never record a decision the user hasn't made.
3. **Write the ADR:** copy `docs/adr/0000-template.md` to the next free number (`NNNN-short-kebab-title.md`), fill Context, Decision, Alternatives considered, Consequences. Keep it concise like the existing ADRs. Status `Accepted` once chosen (`Proposed` if still open).
4. **Update the index** table in `docs/adr/README.md`.
5. **Superseding:** set the old ADR's status to `Superseded by NNNN` and update its index row. Do not rewrite its content (ADR 0001).
6. **Ripple:** list other docs the decision makes stale (`docs/product.md`, `docs/ui.md`, `docs/roadmap.md`, CLAUDE.md) with a proposed fix, and wait for OK before editing them.
7. Commit through the commit workflow as `docs: record ADR NNNN <title>` — or as part of the feature branch it belongs to.
