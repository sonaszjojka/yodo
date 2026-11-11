// A short, directory-wide lock file so that writes from several MCP processes
// sharing YODO_MCP_DIR take turns (ADR 0067). Held only for one operation.

import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'

export const LOCK_FILE = '.lock'

export interface LockOptions {
  /** How long to wait for a busy lock before giving up (default 5 s). */
  timeoutMs?: number
  /** A lock older than this is stale, whoever holds it (default 30 s). */
  staleMs?: number
  /** Pause between attempts (default 25 ms). */
  retryMs?: number
  now?: () => number
}

interface Holder {
  token: string
  pid: number
  host: string
  at: number
}

/** Another process held the lock for the whole timeout. */
export class LockBusyError extends Error {
  constructor(dir: string) {
    super(
      `Another Yodo MCP process is writing to ${dir}; try the call again in a moment.`,
    )
    this.name = 'LockBusyError'
  }
}

function errorCode(error: unknown): unknown {
  return (error as { code?: unknown })?.code
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return errorCode(error) === 'EPERM'
  }
}

function parseHolder(text: string): Holder | undefined {
  try {
    const value = JSON.parse(text) as Partial<Holder>
    return typeof value.token === 'string' &&
      typeof value.pid === 'number' &&
      typeof value.host === 'string' &&
      typeof value.at === 'number'
      ? (value as Holder)
      : undefined
  } catch {
    return undefined
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Runs `task` while holding `<dir>/.lock`. The lock is created exclusively,
 * taken over when stale (its process is gone, it is too old, or unreadable),
 * and removed afterwards only if it is still ours.
 */
export async function withDirLock<T>(
  dir: string,
  task: () => Promise<T>,
  {
    timeoutMs = 5_000,
    staleMs = 30_000,
    retryMs = 25,
    now = Date.now,
  }: LockOptions = {},
): Promise<T> {
  const path = join(dir, LOCK_FILE)
  await mkdir(dir, { recursive: true })
  const token = randomUUID()
  const deadline = now() + timeoutMs

  for (;;) {
    try {
      const handle = await open(path, 'wx')
      try {
        const holder: Holder = {
          token,
          pid: process.pid,
          host: hostname(),
          at: now(),
        }
        await handle.writeFile(JSON.stringify(holder), 'utf8')
      } finally {
        await handle.close()
      }
      break
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
    }
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      // Released between our attempt and this read: try again at once.
      if (errorCode(error) === 'ENOENT') continue
      throw error
    }
    const holder = parseHolder(text)
    // A holder that has written nothing yet looks unreadable for a moment, so
    // only an unreadable lock that stays that way past `staleMs` is stale.
    const stale =
      holder === undefined
        ? false
        : now() - holder.at > staleMs ||
          (holder.host === hostname() && !isAlive(holder.pid))
    if (stale || (holder === undefined && now() > deadline)) {
      // Move it aside first, so only one process removes a given lock.
      const aside = join(dir, `${LOCK_FILE}-stale-${randomUUID()}`)
      try {
        await rename(path, aside)
        await rm(aside, { force: true })
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }
      continue
    }
    if (now() > deadline) throw new LockBusyError(dir)
    await sleep(retryMs)
  }

  try {
    return await task()
  } finally {
    await release(path, token)
  }
}

/** Removes the lock if it is still ours; one taken over is left alone. */
async function release(path: string, token: string): Promise<void> {
  try {
    if (parseHolder(await readFile(path, 'utf8'))?.token === token) {
      await rm(path, { force: true })
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}
