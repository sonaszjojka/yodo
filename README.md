# Yodo

A local-first, hand-drawn style drawing app, in the spirit of Excalidraw. Early development: see [`docs/roadmap.md`](docs/roadmap.md).

## Use it

**In the browser:** [sonaszjojka.github.io/yodo](https://sonaszjojka.github.io/yodo/). Drawings stay in your browser (IndexedDB).

**Self-hosted with Docker:** drawings are stored on disk in the `yodo-data` volume.

```sh
docker run -p 127.0.0.1:8080:8080 -v yodo-data:/data ghcr.io/sonaszjojka/yodo
```

Then open <http://localhost:8080>. Publishing on `127.0.0.1` keeps the server reachable from this machine only ([ADR 0020](docs/adr/0020-auth-and-origin-checks.md)).

| Variable | Default | Meaning |
|---|---|---|
| `YODO_ADDR` | `127.0.0.1:8080` (`0.0.0.0:8080` in the image) | Address the server listens on |
| `YODO_ALLOWED_ORIGINS` | `http://localhost:8080,http://127.0.0.1:8080` | Comma-separated origins the server accepts requests for; others get 403. Set it when you open Yodo under another hostname or port, e.g. `http://yodo.home:8080`. In Docker this is the port you publish (`-p 127.0.0.1:3000:8080` → `http://localhost:3000`), not the container's 8080 |

## Develop

The monorepo has `web/` (React + Vite + TypeScript) and `server/` (Go). Commands and architecture are in [`CLAUDE.md`](CLAUDE.md), decisions in [`docs/adr/`](docs/adr/README.md) and working conventions in [`docs/conventions.md`](docs/conventions.md).

Build the image locally with `docker build -t yodo .`. A plain `go build` in `server/` serves "frontend not built" until `web/dist` is copied into `server/internal/webui/dist/` ([ADR 0019](docs/adr/0019-docker-image-build-and-publishing.md)).

## License

[MIT](LICENSE)
