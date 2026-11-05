# 0039. Copy and paste elements through the system clipboard with a validated JSON payload

- Status: Accepted
- Date: 2026-11-05

## Context
Roadmap 2.5 needs elements to copy and paste within a drawing and between drawings (`docs/product.md`). Drawings open one at a time, in the same tab or another, and the page may reload in between, so the copied elements can't live only in editor state. Image paste (2.6) will need the same channel.

## Decision
- **The system clipboard, through the native `copy`, `cut` and `paste` DOM events.** The editor serialises the selection to a plain-text payload `{"type":"yodo/clipboard","version":1,"elements":[…]}` and the UI sets/reads it with `event.clipboardData` (synchronous, no permission prompt, works on plain-HTTP self-hosted). The events are ignored when a text field is focused, so editing text keeps its native behaviour.
- **The payload is untrusted input.** A pure validator in `core/document/` keeps only structurally valid elements (known type, finite numbers, valid enums, well-formed points and labels) and caps the element count and payload size. Anything that isn't our marker and version is not ours, and paste does nothing.
- Pasted elements get new ids and keep their seed, so they look the same (ADR 0004). The payload is a clipboard format, not the document format: it has its own `version` and needs no schema migration (ADR 0013).

## Alternatives considered
- **A module-level variable** — no validation needed, but lost on reload and not shared between tabs, so "between drawings" would only work within one page session.
- **The async `navigator.clipboard` API** — needs permission and a secure context; it fails on self-hosted over plain HTTP on a LAN.

## Consequences
- Copy and paste work across drawings, tabs and reloads, and the JSON is readable if pasted elsewhere.
- Image paste (2.6) can reuse the same paste event.
- We maintain a validator that must learn every new element type or field.
