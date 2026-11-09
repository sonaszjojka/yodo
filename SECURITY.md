# Security policy

## Supported versions
Only the latest minor release (the `latest` Docker image and the hosted app) receives security fixes. Older lines are not maintained unless a `release/X.Y` branch is announced.

## Reporting a vulnerability
**Please do not open a public issue.** Report it privately through GitHub: [Report a vulnerability](../../security/advisories/new) (Security tab → "Report a vulnerability").

Include what you found, how to reproduce it, the version or image tag, and whether you use the hosted or self-hosted mode. You will get an acknowledgement within about 7 days. We will keep you updated, fix confirmed issues in a new release, and credit you in the advisory unless you prefer otherwise. Please give us reasonable time to fix before you disclose publicly.

## Scope notes
- Hosted mode keeps drawings in your browser (IndexedDB) and sends nothing to a server.
- Self-hosted mode binds to localhost by default, checks Host/Origin ([ADR 0020](docs/adr/0020-auth-and-origin-checks.md)) and has an optional `YODO_PASSWORD`. The password travels as plain text over HTTP, so put Yodo behind HTTPS if it is reachable beyond your machine. Reports that require exposing it without HTTPS or a password are usually hardening requests, not vulnerabilities, but we are happy to hear them.
