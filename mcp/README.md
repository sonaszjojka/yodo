# yodo-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI agents (Claude Code, Claude Desktop, Cursor, …) read, draw and render [Yodo](https://github.com/sonaszjojka/yodo) drawings.

```sh
claude mcp add yodo -- npx -y yodo-mcp
```

It needs Node 22 or newer. Without settings, drawings are `.yodo` files in `~/Yodo`, and every write returns a link that opens the drawing in the hosted app. With `YODO_URL` and `YODO_API_TOKEN` it works on your self-hosted Yodo instead.

Setup for each client, both modes and every tool: [Use Yodo from AI agents](https://github.com/sonaszjojka/yodo#use-yodo-from-ai-agents).

MIT licensed. The bundle includes third-party code; see `dist/THIRD_PARTY_LICENSES.md`.
