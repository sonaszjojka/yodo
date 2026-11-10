# 0061. MCP server as a TypeScript package in `mcp/`

- Status: Accepted
- Date: 2026-11-10

## Context
Agents (Claude Code, Claude Desktop, Cursor, …) work with drawing and design tools through MCP (Model Context Protocol). Yodo has no way for an agent to read or edit drawings. M5 adds an MCP server ([#177](https://github.com/sonaszjojka/yodo/issues/177)–[#186](https://github.com/sonaszjojka/yodo/issues/186)). This ADR decides its transport, SDK, package layout, bundling, publishing and CI, before any code. The research below was checked against the primary sources on 2026-11-10.

### Research notes
- **Spec.** The current revision is [2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/) (previous: 2025-11-25). Its core is stateless: no `initialize` handshake and no `Mcp-Session-Id`; every request carries its protocol version, client info and capabilities, with an optional `server/discover`. Multi Round-Trip Requests replace server-initiated elicitation, sampling and roots. Tool schemas are full JSON Schema 2020-12, and list results are cacheable (`ttlMs`). A new extensions framework makes MCP Apps and Tasks official extensions. Roots, Sampling, Logging, the HTTP+SSE transport and Dynamic Client Registration are deprecated, with at least 12 months of support.
- **TypeScript SDK.** [v2](https://ts.sdk.modelcontextprotocol.io/v2/) is the stable line for 2026-07-28. It is split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client` (2.4.0; Node ≥ 20; depends on `zod ^4.2`). The v1 package `@modelcontextprotocol/sdk` (1.32) is the legacy line. Tools are registered with `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)`, and a stdio server is `serveStdio(() => new McpServer(…))`. A v2 server still [answers 2025-era clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html) that start with `initialize`: by default, `serveStdio` pins such a connection to a legacy instance. For [in-process tests](https://ts.sdk.modelcontextprotocol.io/v2/testing.html), `createMcpHandler(factory)` plus a `StreamableHTTPClientTransport` whose `fetch` is `handler.fetch` covers 2026-07-28; `InMemoryTransport.createLinkedPair()` covers 2025-era instances only; `StdioClientTransport` spawns the real process.
- **stdio vs Streamable HTTP.** With stdio, the client launches a local process (for example `npx -y <package>`) and talks over its stdin/stdout. There is no network listener, no auth surface and one user, and it's how Claude Code, Claude Desktop and Cursor configure local tools. Streamable HTTP is for a remote or long-running endpoint. It needs authorization (the OAuth 2.1 profile, now with Client ID Metadata Documents) and Origin checks, and in 2026-07-28 the `Mcp-Method`/`Mcp-Name` routing headers. Hosted connectors (Excalidraw, Figma) use it.
- **MCP Apps.** [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (`io.modelcontextprotocol/ui`, stable spec 2026-01-26, [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)) lets a tool declare `_meta.ui.resourceUri` pointing at a `ui://` HTML resource. The host renders that resource in a sandboxed iframe and talks to it over postMessage JSON-RPC (`@modelcontextprotocol/ext-apps`). Tools can be hidden from the model and callable by the app only (`_meta.ui.visibility: ["app"]`). Claude, ChatGPT, VS Code, Goose and others support it, but support varies by host. It works over stdio too.
- **Excalidraw's official server** ([`excalidraw/excalidraw-mcp`](https://github.com/excalidraw/excalidraw-mcp), `src/server.ts`). It's an MCP App on SDK v1 plus ext-apps, hosted at `mcp.excalidraw.com`, with a stdio mode. The model sees two tools. `read_me` returns a cheat sheet (element format, palettes, examples, "call before `create_view`"). `create_view` takes one JSON-array string of Excalidraw elements, with pseudo-elements `cameraUpdate` and `delete`, and streams it into an inline widget; oversized or malformed input comes back as an `isError` result with a hint. App-only tools: `export_to_excalidraw`, `save_checkpoint` and `read_checkpoint`. It is stateless: it never reads the user's existing drawings.
- **Figma's official server** ([tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)). It has a remote server (recommended) and a desktop server. Reads are layered by cost: `get_metadata` (a sparse XML outline of ids, names, types, positions and sizes) first, then `get_design_context` on chosen nodes, and `get_screenshot`, which is costly in tokens and can be turned off. Write tools are remote-only: `use_figma` (runs Plugin-API code), `generate_diagram` (from a description or Mermaid), `create_new_file` and `upload_assets`. Responses document their caps and set `truncated` flags.
- **What this means for Yodo.** Reads should be compact, carry ids, and come as text; images belong in a separate tool the agent opts into (Figma's `get_metadata` vs `get_screenshot`). A high-level diagram tool saves the model from placing every element (`generate_diagram`). Format guidance goes into tool descriptions and the server's instructions (Excalidraw's `read_me`). Limits and bad input come back as `isError` results that say how to fix the call. Unlike both servers, Yodo must read and edit the user's *existing* drawings, so the storage backend is central.

### Repo facts
- `web/src/core/` uses no browser globals ([0002](0002-frontend-react-typescript-vite.md)). `web/src/storage/http.ts` takes an injected `fetch`. The SVG export ([0043](0043-export-svg-with-a-parallel-pure-svg-renderer.md)) gets its fonts from `ui/svgFonts.ts` through Vite `?url` imports, so core never fetches anything.
- `web/` compiles with `allowImportingTsExtensions`, `erasableSyntaxOnly` and `moduleResolution: bundler`, and imports use `.ts` extensions. The only Vite-only import in core or storage is `?raw` in the test-only `storage/contract.ts`.
- There is no root `package.json`: `web/` and `e2e/` are independent npm packages, CI uses path filters and there is no monorepo build tool ([0012](0012-monorepo.md)). Vite is `^8.3.6`.
- release-please has one component (`.`) that bumps `web/package.json` as an extra file ([0058](0058-release-please-for-versions-and-changelog.md)).
- Node won't strip TypeScript types from files under `node_modules`, so a package that ships `.ts` sources can't run under `npx`.
- The hosted app keeps drawings in the browser's IndexedDB ([0005](0005-browser-storage-indexeddb.md)), which no local process can reach.

## Decision
Yodo's MCP server is a new top-level TypeScript package, `mcp/`. It reuses `web/src/core` and `web/src/storage` by relative import, talks MCP over stdio with the official v2 SDK, and is bundled by Vite into one file published to npm as `yodo-mcp` (`npx -y yodo-mcp`).

- **Package.** `mcp/` sits beside `web/`, `server/` and `e2e/`. It's a Node ESM package with the same tools as `web/`: Vitest, oxlint, Prettier and `tsc --noEmit`.
- **SDK.** `@modelcontextprotocol/server` v2 with `zod` 4, and `@modelcontextprotocol/client` v2 as a dev dependency for tests. It targets spec 2026-07-28 and keeps the SDK's default legacy serving, so 2025-era clients work. It uses tools and server `instructions` only. No Sampling, Roots or Logging (deprecated); resources and MCP Apps only by a later decision.
- **Transport.** stdio only for M5 (`serveStdio`). A Streamable HTTP endpoint needs its own ADR: auth and Origin checks against [0020](0020-auth-and-origin-checks.md).
- **Imports and the core boundary.**
  - `mcp/src` imports `web/src/core/**` and `web/src/storage/**` by relative path with `.ts` extensions (for example `../../web/src/core/search/match.ts`). It never imports `web/src/ui/**` or the browser-only `web/src/storage/indexeddb.ts`. An oxlint `no-restricted-imports` rule in `mcp/` enforces this.
  - Modules that `mcp/` imports must run in Node: no browser globals, and no Vite-only imports (`?url`, `?raw`, `import.meta.env`) outside test files.
  - Node-specific code (file system, fonts read from disk, a rasterizer) lives in `mcp/` and is injected into core, the way `ui/` injects fonts today. Core stays framework-free and environment-free.
  - Bare imports in shared files (such as `roughjs`) resolve from `web/node_modules`, so `web/package.json` stays the single owner of those versions. Building `mcp/` needs `npm ci` in `web/` as well.
- **Bundle.** `vite build` in SSR mode with `ssr.noExternal: true` writes one self-contained `mcp/dist/index.js` with a `#!/usr/bin/env node` banner. The published package has no runtime dependencies. `vite` is a dev dependency of `mcp/` at the same version as in `web/`. The build target and `engines` are Node ≥ 22, because end users run it with their own Node; development stays on Node 26.
- **Publishing.** The npm package is `yodo-mcp` (`bin: yodo-mcp`), run as `npx -y yodo-mcp`. It has the same version as the app: release-please gets `mcp/package.json` as another extra file of the `.` component. The release workflow publishes it on the `vX.Y.Z` tag with npm trusted publishing (OIDC) and provenance, with actions pinned by SHA ([0018](0018-ci-github-actions-gate-job.md)). It isn't added to the Docker image, since stdio runs on the agent's machine. The npm name is reserved and the workflow set up in 5.9.
- **CI.**
  - A new path filter `mcp` covers `mcp/**`, `web/src/core/**`, `web/src/storage/**`, `web/package.json`, `web/package-lock.json` and `.github/workflows/**`.
  - A new `mcp` job installs `web/` and `mcp/`, runs lint, format check, type check, tests and the build, then smoke-tests `dist/index.js` over stdio with `StdioClientTransport`.
  - The job is added to the `ci` job's `needs` ([0018](0018-ci-github-actions-gate-job.md)).
- **Backends.**
  - **Self-hosted:** `HttpDrawingRepository` against `YODO_URL`, authenticated with `YODO_API_TOKEN` (5.2).
  - **Otherwise:** a file backend that keeps `.yodo` files in a directory (5.4).
  - **Hosted:** an open link instead (5.8), because neither a local process nor an MCP App iframe (it runs on the host's origin) can reach the hosted app's IndexedDB.

## Alternatives considered
- **v1 SDK (`@modelcontextprotocol/sdk`)**, as Excalidraw uses: the legacy line, so a v2 migration would follow soon, and the 2026-07-28 change is architectural and can't be done by the codemod.
- **No SDK (hand-rolled JSON-RPC):** follows protocol churn by hand, for no gain.
- **An MCP server in Go inside `server/`:** can't reuse the TypeScript core (geometry, bindings, validation, SVG export, search), and hosted-mode users have no Go server.
- **Streamable HTTP first:** adds an auth surface that local agents don't need. It stays possible later.
- **npm workspaces with a root `package.json`, and `web` exporting a `@yodo/core` package:** a cleaner package boundary, but it changes install and CI layout for the whole repo ([0012](0012-monorepo.md)). Revisit if a third consumer of core appears.
- **Extracting `core/` into its own top-level package:** a large refactor with no gain yet.
- **Shipping TypeScript sources and running them with Node's type stripping:** Node doesn't strip types under `node_modules`, so `npx` would fail.
- **tsdown or esbuild as the bundler:** a new dependency doing what Vite already does in this repo.
- **A separate release-please component and version for `mcp/`:** two versions to explain, when the MCP server follows the document format and API of the same release.
- **MCP Apps now:** host support varies, and it adds a UI bundle. Listed under Later in `docs/product.md`.

## Consequences
- Agents get a local MCP server without a new runtime or language in the repo. Core logic (bindings, validation, export, search) is written once.
- Changes in `web/src/core` or `web/src/storage` now also run the `mcp` job. A Node-hostile import in a shared module fails CI instead of reaching users.
- `mcp/` depends on `web/`'s install, so its CI job installs both.
- The published bundle carries third-party code such as roughjs, so the build must keep license notices.
- Follow-up work is M5 in `docs/roadmap.md` (5.1–5.9). 5.3 sets up the package, bundle, smoke test, boundary rule and CI job; 5.9 sets up npm publishing.
