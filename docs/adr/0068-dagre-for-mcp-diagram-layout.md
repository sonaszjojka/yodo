# 0068. Use dagre for the MCP diagram layout

- Status: Accepted
- Date: 2026-11-11

## Context
Roadmap 5.7 ([#184](https://github.com/sonaszjojka/yodo/issues/184)) adds `create_diagram`: an agent sends nodes, edges and a direction, and the MCP server places them. Models place coordinates poorly, and most agent drawings are flowcharts or box-and-arrow diagrams. The done-when criterion asks for shapes sized to their labels, arrows that don't cross shapes in simple graphs, and an engine chosen with options before it's added.

The standard technique for directed diagrams is a layered (Sugiyama) layout: rank the nodes along the direction, order each rank to reduce crossings, assign coordinates, then route the edges. The tool builds on the 5.6 write path (ADR 0066): the core factories, `binding.ts` for attached arrows, `validate.ts`, and saves with `If-Match`. Labels are measured with the server's canvas `measure` (ADR 0065). The MCP server is bundled by Vite into one file, with `@napi-rs/canvas` as its only runtime dependency (ADR 0061, 0065).

## Decision
Lay out diagrams with **`@dagrejs/dagre`** (MIT), a dependency of `mcp/` only, bundled into `dist/index.js` like the SDK and zod.

- The layout sits behind one pure function in `mcp/` (`layoutGraph`: nodes with their measured sizes, edges and a direction in; node positions and edge waypoints out), so the engine can be swapped without touching the tool.
- Node sizes come from the label measurement, so dagre spaces real shapes. Directions are dagre's `TB`, `BT`, `LR` and `RL`.
- Edges become arrows bound at both ends through `binding.ts`. dagre's inner waypoints become the arrow's middle points, and the bound ends re-snap to the shape outlines, as in the editor.
- `web/` doesn't get the dependency. If the editor ever gets auto-layout, it needs its own decision.

## Alternatives considered
- **elkjs** has the best quality: orthogonal routing, ports and nested graphs. We rejected it because it's licensed EPL-2.0 or GPL-3.0 next to Yodo's MIT, it's about 8 MB unpacked, its API is async only, and its features go well beyond "simple graphs".
- **An in-house layered layout** needs no dependency and gives full control. We rejected it because it means about 400–600 lines of graph algorithms to own and test, and its crossing reduction and spacing would be cruder than dagre's. The `layoutGraph` seam keeps this option open.

## Consequences
- An agent gets a readable diagram from one call, without picking coordinates.
- `mcp/` gains a dependency (`@dagrejs/dagre`, plus `@dagrejs/graphlib`) that Dependabot will track. It's listed beside the SDK and zod and bundled like them, so `@napi-rs/canvas` stays the only unbundled one (ADR 0065).
- dagre routes edges as polylines, not orthogonal lines, so dense graphs can still have edges grazing shapes. Clusters and ports are out of scope.
- Layout is deterministic for the same input, so tests can check positions and the rendered result (`render_drawing`).
