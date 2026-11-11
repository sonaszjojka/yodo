# 0066. Use a compact agent element spec for the MCP write tools

- Status: Accepted
- Date: 2026-11-11

## Context
Roadmap 5.6 ([#183](https://github.com/sonaszjojka/yodo/issues/183)) adds MCP write tools: `create_drawing`, `add_elements`, `update_elements`, `delete_elements` and `connect`. ADR 0061 leaves the shape of their input open: "the agent element spec needs an ADR". A stored `YodoElement` (ADR 0013) has about fifteen required fields, including a rough.js `seed` (ADR 0004), a full `label` object (ADR 0026), bindings with box ratios (ADR 0048, 0054) and line points relative to `x`/`y`. A model that writes all of that by hand spends tokens and makes mistakes. The format is also storage, and it can change under ADR 0013's rules without an agent knowing. Excalidraw's own MCP server takes raw Excalidraw elements plus a cheat sheet (research in ADR 0061). Figma offers a high-level `generate_diagram` instead; Yodo's equivalent is 5.7.

The writes must stay as safe as the editor's. `validate.ts` is the gate for elements from outside (ADR 0039), bindings must stay consistent (`followBindings`, `unbindDeleted`), and a save must not overwrite a newer version (ADR 0062).

## Decision
The write tools take a **compact agent element spec**, defined once as zod schemas in `mcp/`. The server turns it into full elements with the core factories (`create.ts`), checks the result with `validate.ts`, and saves with `If-Match`.

- **Types an agent can create:** `rectangle`, `diamond`, `ellipse`, `note`, `text`, `line` and `arrow`. `image` (needs uploaded bytes) and `pencil` (freehand) are left out. `update_elements` and `delete_elements` work on every element type.
- **Geometry in world units.** A box (`rectangle`, `diamond`, `ellipse`, `note`) has `x`, `y`, `width` and `height`; a note's size defaults to `NOTE_SIZE`. `text` has `x`, `y` and `text`, and its size is measured with the server's text `measure` (ADR 0065). `line` and `arrow` take `points` as **absolute** world points (two or more); the server stores them relative to the first point, as the format does.
- **Text.** `label` is a plain string on a box; `text` is the content of a text element. Optional `fontFamily`, `fontSize` and `textAlign` apply to either.
- **Style.** Yodo's own field names (`strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `roundness`, `startArrowhead`, `endArrowhead`, `curved`), all optional, defaulting to `BUILT_IN_STYLE`. Colours are `#rrggbb` light-theme values (ADR 0015). A note's `backgroundColor` can't be `transparent` (ADR 0038), and a label is centred unless `textAlign` says otherwise.
- **Ids.** A new element may carry an agent-chosen `id` (`^[A-Za-z0-9_-]{1,64}$`), unique in the drawing and the call; otherwise the server generates one with `randomId`. The server sets `seed` and `angle`; agents never send them.
- **Bindings only through `connect`.** `connect` takes pairs of element ids. For each pair it creates an arrow from one element to the other and attaches both ends with the same core code the editor uses (`binding.ts`). An end can attach to a box or to a line or arrow. `update_elements` can't set bindings; moving or resizing an element re-snaps the arrows bound to it (`followBindings`), and `delete_elements` detaches arrows from deleted elements (`unbindDeleted`).
- **Validation rejects; it doesn't repair.** Every element a call creates or changes must pass `isElement`, and `sanitizeElement` must return it unchanged; otherwise the whole call fails as an `isError` result that names the element and the field. Nothing is saved.
- **Concurrency.** Each write tool takes an optional `revision` (the `rev` that `get_drawing` shows). The tool saves with that revision, or with the one it just read, as `expectedRevision` (ADR 0062). On `RevisionConflictError` it returns an `isError` result telling the agent to call `get_drawing` again and retry. It doesn't retry by itself, because the agent's coordinates may rest on the old version.
- **Results.** Each write tool declares an `outputSchema` and returns `structuredContent` with the drawing id, its new revision and the affected ids (`created`, `updated` or `deleted`), plus the same facts as text for clients that ignore structured content. `delete_elements` is annotated `destructiveHint: true`.
- **Documentation.** The spec is explained once in the server `instructions`, and each tool description gives the fields it takes. There is no separate `read_me` tool.

## Alternatives considered
- **Raw `YodoElement` JSON, with defaults filled in** — no mapping code, and every field is reachable. Rejected: it's verbose and error-prone for a model (seeds, label objects, relative points, binding ratios), and it ties the agent API to the storage format.
- **Excalidraw elements through `core/excalidraw`** — models know the format, and the importer exists. Rejected: the import is lossy by design, Excalidraw's label and binding model differs from Yodo's, and agents would write a format Yodo doesn't store.
- **Server-generated ids only** — simpler, and no collision check is needed. Rejected: the agent couldn't plan a diagram before the first call and would have to map ids by position.
- **Retry automatically on a conflict** — fewer failed calls. Rejected: the write could land on a version the agent never saw.

## Consequences
- An agent can draw and connect a small diagram in two calls with readable ids, and the result looks like the editor's work, since the same factories, defaults and binding code made it.
- The spec is a second, smaller format to keep in step with the document format. A new element field doesn't reach agents until the spec adds it.
- The conversion is pure and lives in `mcp/`, so it's unit-tested without a repository; the tools are tested over the file backend, and over HTTP for the `If-Match` path.
- 5.7 (`create_diagram`) builds on these conversions and on `connect`.
