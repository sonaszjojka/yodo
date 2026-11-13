// Starts the Go server for a test suite (ADR 0031): builds the binary, runs
// it on a free port with a throwaway database, and waits for `api/health`.
// No Vitest imports, so mcp/'s type-check can include it (5.9).

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const serverDir = resolve(import.meta.dirname, '../../server')
const startupTimeoutMs = 10_000

/** A port nothing listens on right now (the OS picks it for port 0). */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        typeof address === 'object' && address
          ? done(address.port)
          : fail(new Error('no port assigned')),
      )
    })
  })
}

async function waitForHealth(url: string, exited: () => string | undefined) {
  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline) {
    const exit = exited()
    if (exit) throw new Error(exit)
    try {
      const response = await fetch(new URL('api/health', url))
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`no answer from ${url}api/health in ${startupTimeoutMs} ms`)
}

/** A running Go server and how to stop it (which also deletes its data). */
export interface TestServer {
  /** The app root, ending in `/`. */
  url: string
  stop: () => Promise<void>
}

/** Builds the Go server and starts it with a throwaway database plus `env`. */
export async function startServer(
  env: Record<string, string> = {},
): Promise<TestServer> {
  const dir = await mkdtemp(join(tmpdir(), 'yodo-server-test-'))
  const binary = join(dir, 'yodo')
  // A built binary, not `go run`: stopping `go run` can leave its child running.
  await promisify(execFile)('go', ['build', '-o', binary, './cmd/yodo'], {
    cwd: serverDir,
  })

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const server = spawn(binary, [], {
    env: {
      ...process.env,
      YODO_ADDR: `127.0.0.1:${port}`,
      YODO_ALLOWED_ORIGINS: origin,
      YODO_DATA_DIR: join(dir, 'data'),
      ...env,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  server.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  let exit: string | undefined
  server.once('exit', (code, signal) => {
    exit = `yodo server exited (${signal ?? code}) during the tests:\n${stderr}`
  })

  const stop = async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise((r) => server.once('exit', r))
      server.kill('SIGTERM')
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  }

  try {
    await waitForHealth(`${origin}/`, () => exit)
  } catch (error) {
    await stop()
    throw error
  }
  return { url: `${origin}/`, stop }
}
