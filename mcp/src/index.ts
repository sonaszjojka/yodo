// Entry point of the bundle: `npx -y yodo-mcp` (ADR 0061). stdout carries the
// MCP protocol, so diagnostics go to stderr only.

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import { withBearer } from './auth.ts'
import { ConfigError, readConfig } from './config.ts'
import { createServer } from './server.ts'

function main(): void {
  let config
  try {
    config = readConfig(process.env)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(`yodo-mcp: ${error.message}`)
    process.exit(1)
  }
  const { baseUrl, token } = config
  const repo = new HttpDrawingRepository({
    baseUrl,
    fetch: withBearer(globalThis.fetch, token),
  })
  // Default legacy serving: a 2025-era client that opens with `initialize` is
  // pinned to its own instance from the same factory (ADR 0061).
  serveStdio(() => createServer(repo, { baseUrl }))
}

main()
