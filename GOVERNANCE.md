# Governance

Yodo is a small project with a single maintainer today, who has the final say.

- **Decisions.** Day-to-day changes are decided in pull requests. Architectural decisions are recorded as [ADRs](docs/adr/README.md): propose one in an issue or PR, discuss it openly, and the maintainer decides. Accepted ADRs are never rewritten; a new one supersedes them.
- **Becoming a maintainer.** Contributors with a sustained record of good changes and reviews may be invited by the current maintainer. Maintainers get write access and are listed in [`.github/CODEOWNERS`](.github/CODEOWNERS). When there is more than one maintainer, `main` will require one approving review.
- **Releases** are cut by a maintainer by merging the release PR ([ADR 0058](docs/adr/0058-release-please-for-versions-and-changelog.md)).
- **Conduct.** Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md). Disputes go to the maintainer; if the maintainer is involved, use the private report channel described there.
- **Roadmap.** [`docs/roadmap.md`](docs/roadmap.md) is the plan; suggestions are welcome as issues or discussions.
