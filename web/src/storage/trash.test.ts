import { describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { InMemoryDrawingRepository } from './memory.ts'
import { expiresAt, purgeExpiredTrash, TRASH_RETENTION_MS } from './trash.ts'

const DAY = 24 * 60 * 60 * 1000

describe('trash retention', () => {
  test('is 30 days', () => {
    expect(TRASH_RETENTION_MS).toBe(30 * DAY)
    expect(expiresAt(1000)).toBe(1000 + 30 * DAY)
  })

  test('deletes drawings trashed more than 30 days ago and keeps the rest', async () => {
    let clock = 0
    const repo = new InMemoryDrawingRepository({ now: () => clock })
    const old = createDocument('Old')
    const edge = createDocument('Edge')
    const recent = createDocument('Recent')
    const live = createDocument('Live')
    for (const d of [old, edge, recent, live]) await repo.save(d)
    clock = 1 * DAY
    await repo.trash(old.id)
    clock = 2 * DAY
    await repo.trash(edge.id)
    clock = 20 * DAY
    await repo.trash(recent.id)

    // Exactly 30 days after `edge` was trashed: it is not yet older than that.
    await purgeExpiredTrash(repo, 2 * DAY + 30 * DAY)

    expect((await repo.listTrash()).map((s) => s.id).sort()).toEqual(
      [edge.id, recent.id].sort(),
    )
    expect(await repo.get(old.id)).toBeUndefined()
    expect(await repo.get(live.id)).toEqual(live)
    expect((await repo.list()).map((s) => s.id)).toEqual([live.id])
  })

  test('does not remove a drawing restored after the sweep chose its cutoff', async () => {
    let clock = 0
    const repo = new InMemoryDrawingRepository({ now: () => clock })
    const doc = createDocument('Plan')
    await repo.save(doc)
    await repo.trash(doc.id)
    // Another tab restores it before this tab's sweep reaches storage.
    await repo.restore(doc.id)
    clock = 40 * DAY
    await purgeExpiredTrash(repo, clock)
    expect(await repo.get(doc.id)).toEqual(doc)
    expect((await repo.list()).map((s) => s.id)).toEqual([doc.id])
  })

  test('logs a failure and resolves', async () => {
    const repo = new InMemoryDrawingRepository()
    const error = new Error('offline')
    vi.spyOn(repo, 'emptyTrash').mockRejectedValue(error)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(purgeExpiredTrash(repo, 0)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(expect.any(String), error)
    log.mockRestore()
  })
})
