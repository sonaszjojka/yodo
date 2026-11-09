# 0060. Sign release images with cosign and attach provenance and an SBOM

- Status: Accepted
- Date: 2026-11-09

## Context
Self-hosters run `ghcr.io/sonaszjojka/yodo` ([0049](0049-releases-semver-tags-publish-the-image.md)). For an open-source project they need a way to check that an image came from this repository's CI and what is inside it.

## Decision
- Every pushed image gets build provenance (`provenance: mode=max`) and an SBOM (`sbom: true`) from `docker/build-push-action`.
- Release images (pushed on a `vX.Y.Z` tag) are signed by digest with **cosign keyless** signing, using the workflow's OIDC identity, so there is no private key to store or rotate. `edge` images are not signed.
- The README documents `cosign verify` with the repository's identity.
- Scorecard ([OpenSSF](https://github.com/ossf/scorecard)) runs weekly to track supply-chain practices.

## Alternatives considered
- **Signing with a long-lived key** — needs secure storage and rotation; keyless ties trust to the workflow identity instead.
- **No signing** — simplest, but users can't verify provenance.
- **GitHub artifact attestations** — a good alternative for GitHub-only verification; cosign works with any registry client and is the common convention for container images.

## Consequences
- The `docker` job needs `id-token: write` and a few extra steps on release tags; the first signed release is the test of this change.
- Images from before that release have no signature.
- Provenance and SBOM add a little build time and OCI metadata to the image index.
