# 0016. Lint TypeScript with oxlint

- Status: Accepted
- Date: 2026-11-01

## Context
The `web/` scaffold (roadmap 0.1, [0002](0002-frontend-react-typescript-vite.md)) needs a linter so that "lint is clean" in the definition of done (`docs/conventions.md`) can be checked. The current Vite React template ships oxlint, and the scaffold kept it: `npm run lint`, config in `web/.oxlintrc.json` with the `react`, `typescript` and `oxc` plugins plus the React hooks rules. Type checking itself stays with `tsc` (`npm run build`).

## Decision
Use **oxlint** as the TypeScript/React linter for `web/`, run with `npm run lint`. Rules live in `web/.oxlintrc.json`; start from the defaults and add rules only when a real problem shows up.

Formatting (TypeScript and Go) and Go linting are not part of this decision; they are chosen in roadmap 0.2.

## Alternatives considered
- **ESLint + typescript-eslint** — the long-standing standard with the largest rule ecosystem, including type-aware rules. Rejected for now: several packages and a heavier config for a solo project, much slower, and the rules Yodo needs (hooks, common bugs) are covered by oxlint. Can be added later next to oxlint if a type-aware rule is missed.
- **Biome** — lint and format in one tool. Rejected for linting because the Vite template already ships oxlint; Biome is still a candidate for formatting in 0.2, where it should not also enable its linter.

## Consequences
- One dev dependency, near-zero config, lint runs in well under a second.
- No type-aware lint rules (e.g. floating promises); `tsc` strict mode covers most of the gap.
- 0.2 only adds formatting and Go linting, and must keep the formatter from overlapping with oxlint.
