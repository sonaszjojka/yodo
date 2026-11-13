// Entry point of the bundle: `npx -y yodo-mcp` (ADR 0061). stdout carries the
// MCP protocol, so diagnostics go to stderr only.

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import { HttpImageRepository } from '../../web/src/storage/httpImages.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import { withBearer } from './auth.ts'
import { ConfigError, readConfig } from './config.ts'
import { FileDrawingRepository } from './fileRepository.ts'
import { httpImageSource } from './render/images.ts'
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
    const fetch = withBearer(globalThis.fetch, token)
    repo = new HttpDrawingRepository({ baseUrl, fetch })
    // render_drawing reads pictures from /api/images with the token (ADR 0070).
    const images = httpImageSource(new HttpImageRepository({ baseUrl, fetch }))
    options = { baseUrl, images }
  } else {
    // No server: drawings are `.yodo` files in a directory (ADR 0064).
    const files = new FileDrawingRepository({ dir: config.dir })
    repo = files
    options = {
      dir: config.dir,
      // Write results name the file and an open link for it (ADR 0069).
      openLinks: {
        appUrl: config.appUrl,
        exportFile: (id, revision) => files.exportFile(id, revision),
      },
      // render_drawing reads the pictures inlined in the file (ADR 0070).
      images: { read: (id, fileIds) => files.imageFiles(id, fileIds) },
    }
  }
  // Default legacy serving: a 2025-era client that opens with `initialize` is
  // pinned to its own instance from the same factory (ADR 0061). Every
  // instance shares the one repository, so its write queue covers them all.
  serveStdio(() => createServer(repo, options))
}

main()
