// Entry point of the bundle: `npx -y yodo-mcp` (ADR 0061). stdout carries the
// MCP protocol, so diagnostics go to stderr only.

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import { withBearer } from './auth.ts'
import { ConfigError, readConfig } from './config.ts'
import { FileDrawingRepository } from './fileRepository.ts'
import { createServer, type ServerOptions } from './server.ts'

function main(): void {
  let config
  try {
    config = readConfig(process.env)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(`yodo-mcp: ${error.message}`)
    process.exit(1)
  }
  let repo: DrawingRepository
  let options: ServerOptions
  if (config.backend === 'http') {
    const { baseUrl, token } = config
    repo = new HttpDrawingRepository({
      baseUrl,
      fetch: withBearer(globalThis.fetch, token),
    })
    options = { baseUrl }
  } else {
    // No server: drawings are `.yodo` files in a directory (ADR 0064).
    repo = new FileDrawingRepository({ dir: config.dir })
    options = { dir: config.dir }
  }
  // Default legacy serving: a 2025-era client that opens with `initialize` is
  // pinned to its own instance from the same factory (ADR 0061). Every
  // instance shares the one repository, so its write queue covers them all.
  serveStdio(() => createServer(repo, options))
}

main()
