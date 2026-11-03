// Vitest global setup for `npm run test:server` (ADR 0031): builds the Go
// server, starts it on a free port with a throwaway database, and hands its
// URL to the tests through `provide('serverUrl')`.

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { TestProject } from 'vitest/node'

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

export default async function setup(project: TestProject) {
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
  project.provide('serverUrl', `${origin}/`)
  return stop
}
