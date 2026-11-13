# Yodo

[![CI](https://github.com/sonaszjojka/yodo/actions/workflows/ci.yml/badge.svg)](https://github.com/sonaszjojka/yodo/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/sonaszjojka/yodo)](https://github.com/sonaszjojka/yodo/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local-first, hand-drawn style drawing app, in the spirit of Excalidraw. Shapes, arrows that stay attached, pencil, text and images on an infinite canvas; folders, search and Trash for your drawings; PNG, SVG and `.yodo` export, and import of `.yodo` and Excalidraw files; light and dark themes. Roadmap and status: [`docs/roadmap.md`](docs/roadmap.md).

## Two ways to use Yodo

The same app runs in two modes. Yodo picks the mode itself when it starts, so you use it the same way in both.

| | Hosted | Self-hosted |
|---|---|---|
| Where you open it | [sonaszjojka.github.io/yodo](https://sonaszjojka.github.io/yodo/) | <http://localhost:8080> (or your own address) |
| Where drawings live | In your browser (IndexedDB) | On your disk, in a SQLite database on the server |
| Install | None | Docker |
| Same drawings in every browser | No: each browser has its own | Yes |
| Survives clearing browser data | No | Yes |
| Password | None (nothing leaves your browser) | Optional, `YODO_PASSWORD` |
| Back up | Export drawings as `.yodo` files | Copy the data directory (the Docker volume) |

To move drawings from one mode to the other, export them as `.yodo` files (card menu → Export as .yodo) and use **Import file** on Home in the other mode.

### Hosted

Open [sonaszjojka.github.io/yodo](https://sonaszjojka.github.io/yodo/). Drawings stay in your browser and are never uploaded. Clearing site data for the page deletes them, so export the ones you want to keep.

### Self-hosted with Docker

Drawings are stored on disk in the `yodo-data` volume.

```sh
docker run -p 127.0.0.1:8080:8080 -v yodo-data:/data ghcr.io/sonaszjojka/yodo:1.0.0
```

Then open <http://localhost:8080>. Publishing on `127.0.0.1` keeps the server reachable from this machine only ([ADR 0020](docs/adr/0020-auth-and-origin-checks.md)).

Image tags: `1.0.0` is that exact release, `1.0` follows the latest patch of that minor version, and `latest` is the newest release. `edge` is the current `main`, which may be unreleased ([ADR 0049](docs/adr/0049-releases-semver-tags-publish-the-image.md)).

### Verify the image

Release images are signed with [cosign](https://github.com/sigstore/cosign) (keyless, from this repository's CI) and carry build provenance and an SBOM:

```sh
cosign verify ghcr.io/sonaszjojka/yodo:X.Y.Z \
  --certificate-identity-regexp '^https://github.com/sonaszjojka/yodo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Replace `X.Y.Z` with a release that came after this was added; `1.0.0` and `edge` images are not signed.

| Variable | Default | Meaning |
|---|---|---|
| `YODO_ADDR` | `127.0.0.1:8080` (`0.0.0.0:8080` in the image) | Address the server listens on |
| `YODO_ALLOWED_ORIGINS` | `http://localhost:8080,http://127.0.0.1:8080` | Comma-separated origins the server accepts requests for; others get 403. Set it when you open Yodo under another hostname or port, e.g. `http://yodo.home:8080`. In Docker this is the port you publish (`-p 127.0.0.1:3000:8080` → `http://localhost:3000`), not the container's 8080 |
| `YODO_PASSWORD` | unset (no password) | If set, the app asks for it before showing any drawing, and the API answers 401 without a login. A login lives in an `httpOnly` cookie: until the browser closes, or 30 days with "Remember this browser". Logins are kept in memory, so restarting the server asks again. The password travels as plain text over HTTP, so put Yodo behind HTTPS when it is reachable beyond your own machine |
| `YODO_API_TOKEN` | unset (no token) | For scripts and agents that aren't a browser, such as the MCP server. A request with `Authorization: Bearer <token>` needs no `Origin` header and no login, even with `YODO_PASSWORD` set; the `Host` check still applies, and an `Origin` that is sent must still be allowed. At least 32 characters; make one with `openssl rand -hex 32`. A shorter or malformed value stops startup, and a wrong token gets 401. It grants full access, so keep it out of shared config and dotfiles, and use HTTPS beyond your own machine. Example: `curl -H "Authorization: Bearer $YODO_API_TOKEN" http://localhost:8080/api/drawings` |
| `YODO_DATA_DIR` | `./data` (`/data` in the image) | Directory holding the SQLite database `yodo.db` and pasted images in `images/`; created if missing. Back up this directory (the Docker volume) to back up your drawings |

## Use Yodo from AI agents

`yodo-mcp` is an [MCP](https://modelcontextprotocol.io) server that lets an agent (Claude Code, Claude Desktop, Cursor or any MCP client) list, read, draw, connect and render Yodo drawings. The agent starts it on your machine with `npx`, so it needs [Node.js](https://nodejs.org) 22 or newer; nothing is added to the Docker image ([ADR 0061](docs/adr/0061-mcp-server-as-a-typescript-package-in-mcp.md)). It has two setups:

> **Not on npm yet.** Until `yodo-mcp` is published, build it from a clone (`npm ci` in `web/` and `mcp/`, then `npm run build` in `mcp/`) and use `node /path/to/yodo/mcp/dist/index.js` wherever this section says `npx -y yodo-mcp` (in JSON: `"command": "node", "args": ["/path/to/yodo/mcp/dist/index.js"]`).

- **Standalone** (no settings): drawings are `.yodo` files in `~/Yodo`. Every write answers with the file's path and a link that opens the drawing in the hosted app, where you confirm and it's imported into your browser.
- **Self-hosted**: with `YODO_URL` and `YODO_API_TOKEN` it works on your self-hosted Yodo, and what the agent draws shows on Home right away.

### Claude Code

```sh
# Standalone
claude mcp add yodo -- npx -y yodo-mcp

# Self-hosted
claude mcp add yodo --env YODO_URL=http://localhost:8080 --env YODO_API_TOKEN=<token> -- npx -y yodo-mcp
```

Then ask, for example, "Draw a login-flow diagram in Yodo". `claude mcp add` saves to your user config for this project by default, which keeps the token out of the repository; don't use `--scope project` with a token.

### Claude Desktop and Cursor

Both read the same JSON: Claude Desktop in `claude_desktop_config.json` (Settings → Developer → Edit Config), Cursor in `~/.cursor/mcp.json`. Leave out `env` for the standalone setup.

```json
{
  "mcpServers": {
    "yodo": {
      "command": "npx",
      "args": ["-y", "yodo-mcp"],
      "env": {
        "YODO_URL": "http://localhost:8080",
        "YODO_API_TOKEN": "<token>"
      }
    }
  }
}
```

### Self-hosted setup

Start the server with a token (at least 32 characters) and give the agent the same one:

```sh
export YODO_API_TOKEN=$(openssl rand -hex 32)
docker run -p 127.0.0.1:8080:8080 -e YODO_API_TOKEN -v yodo-data:/data ghcr.io/sonaszjojka/yodo:latest
```

`YODO_URL` is the address you open Yodo at. Its host must be in the server's `YODO_ALLOWED_ORIGINS` (the defaults cover `localhost:8080` and `127.0.0.1:8080`). The token grants full access, as described under `YODO_API_TOKEN` above. The agent saves with the revision it read, so an edit you make in the browser at the same time is never overwritten: the agent is told to read the drawing again ([ADR 0062](docs/adr/0062-revision-counter-and-if-match-for-safe-concurrent-saves.md)).

### Standalone setup

Drawings are one `.yodo` file each, in `YODO_MCP_DIR`, and deleted ones move to its `.trash/` folder. You can open any of them with **Import file** on Home. The open link carries the whole drawing in the URL fragment, so it never reaches a server. A drawing too big for a link (over 16,384 characters) gets only its file path. Point the links at your own Yodo with `YODO_APP_URL`.

| Variable | Default | Meaning |
|---|---|---|
| `YODO_URL` | unset (standalone) | Self-hosted Yodo to work on, e.g. `http://localhost:8080` |
| `YODO_API_TOKEN` | unset | The server's `YODO_API_TOKEN`; needs `YODO_URL` |
| `YODO_MCP_DIR` | `~/Yodo` | Standalone: folder of `.yodo` files, created if missing |
| `YODO_APP_URL` | `https://sonaszjojka.github.io/yodo/` | Standalone: the app the open links point at |

### Tools

| Tool | What it does |
|---|---|
| `list_drawings` | Every drawing outside Trash, newest first: id, name, last saved and revision |
| `search_drawings` | Drawings whose name or canvas text contains the query, as Yodo's own search |
| `get_drawing` | A drawing's outline: revision, bounds and one line per element (id, type, box, text, bindings) |
| `render_drawing` | The drawing, some elements or one area as a PNG or SVG image the agent can look at |
| `create_drawing` | A new drawing, optionally with elements |
| `add_elements` | Adds rectangles, diamonds, ellipses, notes, text, lines and arrows |
| `update_elements` | Moves, resizes, relabels or restyles elements by id; attached arrows follow |
| `delete_elements` | Deletes elements by id |
| `connect` | Arrows attached at both ends between elements, which follow when either moves |
| `create_diagram` | A laid-out flowchart from nodes and edges, no coordinates needed, as a new drawing or below an existing one |

Writes accept the `revision` from `get_drawing` and return the new one, so an agent never saves over a newer version.

## Develop

The monorepo has `web/` (React + Vite + TypeScript), `server/` (Go), `e2e/` (Playwright) and `mcp/` (the MCP server for agents). Commands and architecture are in [`CLAUDE.md`](CLAUDE.md), decisions in [`docs/adr/`](docs/adr/README.md) and working conventions in [`docs/conventions.md`](docs/conventions.md).

Build the image locally with `docker build -t yodo .`. A plain `go build` in `server/` serves "frontend not built" until `web/dist` is copied into `server/internal/webui/dist/` ([ADR 0019](docs/adr/0019-docker-image-build-and-publishing.md)).

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) (setup, checks, pull requests, DCO sign-off). Questions go to [Discussions](https://github.com/sonaszjojka/yodo/discussions), security problems to [`SECURITY.md`](SECURITY.md). Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md); [`GOVERNANCE.md`](GOVERNANCE.md) says how decisions are made. Changes reach users with the next release, not on merge ([ADR 0057](docs/adr/0057-deploy-the-hosted-app-from-release-tags.md)).

## License

[MIT](LICENSE)
