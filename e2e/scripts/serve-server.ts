// Starts the self-hosted server for Playwright's `webServer` (ADR 0035): the
// binary from `build:app`, on the given port, with a throwaway database.
// Usage: node scripts/serve-server.ts <port>

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const port = process.argv[2]
if (!port) throw new Error('usage: serve-server.ts <port>')

const binary = resolve(import.meta.dirname, '../.bin/yodo')
const dataDir = mkdtempSync(join(tmpdir(), 'yodo-e2e-'))
const cleanUp = () => rmSync(dataDir, { recursive: true, force: true })

const server = spawn(binary, [], {
  env: {
    ...process.env,
    YODO_ADDR: `127.0.0.1:${port}`,
    YODO_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    YODO_DATA_DIR: dataDir,
  },
  stdio: 'inherit',
})

// Playwright stops this script with a signal; pass it on so the server shuts
// down gracefully before the database directory goes.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}
server.on('error', (error) => {
  console.error(`could not start ${binary}; run \`npm run build:app\``, error)
  cleanUp()
  process.exit(1)
})
server.on('exit', (code, signal) => {
  cleanUp()
  process.exit(code ?? (signal ? 1 : 0))
})
