import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { LOCK_FILE, LockBusyError, withDirLock } from './dirLock.ts'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yodo-lock-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})

/** A lock as another process would leave it. */
async function planted(dir: string, holder: object) {
  await writeFile(join(dir, LOCK_FILE), JSON.stringify(holder))
}

/** A pid that is very unlikely to be running. */
const DEAD_PID = 2 ** 22 - 3

describe('withDirLock (ADR 0067)', () => {
  test('holds the lock during the task and removes it after', async () => {
    const dir = await tempDir()
    const seen = await withDirLock(dir, async () => readdir(dir))
    expect(seen).toContain(LOCK_FILE)
    expect(await readdir(dir)).not.toContain(LOCK_FILE)
  })

  test('removes the lock after a failing task, keeping the error', async () => {
    const dir = await tempDir()
    await expect(
      withDirLock(dir, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await readdir(dir)).not.toContain(LOCK_FILE)
  })

  test('runs tasks one at a time', async () => {
    const dir = await tempDir()
    let inside = 0
    let most = 0
    const task = async () => {
      inside++
      most = Math.max(most, inside)
      await new Promise((done) => setTimeout(done, 10))
      inside--
    }
    await Promise.all(
      Array.from({ length: 5 }, () => withDirLock(dir, task, { retryMs: 2 })),
    )
    expect(most).toBe(1)
  })

  test('gives up on a live, fresh lock with a busy error', async () => {
    const dir = await tempDir()
    await planted(dir, {
      token: 'other',
      pid: process.pid,
      host: hostname(),
      at: Date.now(),
    })
    let ran = false
    await expect(
      withDirLock(
        dir,
        async () => {
          ran = true
        },
        { timeoutMs: 60, retryMs: 10 },
      ),
    ).rejects.toBeInstanceOf(LockBusyError)
    expect(ran).toBe(false)
    // Not ours, so it stays.
    expect(JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf8')).token).toBe(
      'other',
    )
  })

  test('takes over a lock whose process is gone', async () => {
    const dir = await tempDir()
    await planted(dir, {
      token: 'dead',
      pid: DEAD_PID,
      host: hostname(),
      at: Date.now(),
    })
    expect(await withDirLock(dir, async () => 'ran', { timeoutMs: 60 })).toBe(
      'ran',
    )
    expect(await readdir(dir)).toEqual([])
  })

  test('takes over a lock that is too old, even from another host', async () => {
    const dir = await tempDir()
    await planted(dir, {
      token: 'old',
      pid: process.pid,
      host: 'elsewhere',
      at: Date.now() - 60_000,
    })
    expect(await withDirLock(dir, async () => 'ran', { timeoutMs: 60 })).toBe(
      'ran',
    )
  })

  test('never takes over a fresh unreadable lock, even past its deadline', async () => {
    // Codex review round 2: a waiter past its deadline stole a lock another
    // process had just created. A fresh lock is busy, however it reads.
    const dir = await tempDir()
    await writeFile(join(dir, LOCK_FILE), '')
    let ran = false
    await expect(
      withDirLock(
        dir,
        async () => {
          ran = true
        },
        { timeoutMs: 40, retryMs: 10 },
      ),
    ).rejects.toBeInstanceOf(LockBusyError)
    expect(ran).toBe(false)
    expect(await readdir(dir)).toEqual([LOCK_FILE])
  })

  test('takes over an unreadable lock older than the stale limit', async () => {
    const dir = await tempDir()
    const path = join(dir, LOCK_FILE)
    await writeFile(path, '')
    const old = new Date(Date.now() - 60_000)
    await utimes(path, old, old)
    expect(
      await withDirLock(dir, async () => 'ran', { timeoutMs: 40, retryMs: 10 }),
    ).toBe('ran')
  })

  test('a lock is never seen half written', async () => {
    const dir = await tempDir()
    const seen = await withDirLock(dir, async () =>
      JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf8')),
    )
    expect(seen).toMatchObject({ pid: process.pid, host: hostname() })
    // No temp file is left beside it.
    expect(await readdir(dir)).toEqual([])
  })

  test('leaves a lock that someone else took over meanwhile', async () => {
    const dir = await tempDir()
    await withDirLock(dir, async () => {
      // Our lock was judged stale and replaced while we ran.
      await planted(dir, {
        token: 'newer',
        pid: process.pid,
        host: hostname(),
        at: Date.now(),
      })
    })
    expect(JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf8')).token).toBe(
      'newer',
    )
  })
})
