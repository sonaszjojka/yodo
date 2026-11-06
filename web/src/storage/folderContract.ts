// The behaviour every FolderRepository, and every DrawingRepository's folder
// methods, must share (ADR 0011, 0045). Each implementation's test file calls
// `describeFolderContract`; this file is not a test file itself.

import { beforeEach, describe, expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { FolderInput, FolderRepository } from './folders.ts'
import type { DrawingRepository } from './repository.ts'

export interface RepositoryPair {
  drawings: DrawingRepository
  folders: FolderRepository
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id)
}

function folderInput(name: string): FolderInput {
  return { id: crypto.randomUUID(), name, icon: 'briefcase', color: 'teal' }
}

export function describeFolderContract(
  name: string,
  makeRepositories: () => RepositoryPair | Promise<RepositoryPair>,
): void {
  describe(`${name} (folder contract)`, () => {
    let drawings: DrawingRepository
    let folders: FolderRepository
    let doc: YodoDocument

    beforeEach(async () => {
      ;({ drawings, folders } = await makeRepositories())
      doc = createDocument('Plan')
    })

    test('starts with no folders', async () => {
      expect(await folders.list()).toEqual([])
    })

    test('saves and lists a folder', async () => {
      const input = folderInput('Work')
      const saved = await folders.save(input)
      expect(saved).toMatchObject(input)
      expect(saved.createdAt).toBeGreaterThan(0)
      expect(await folders.list()).toEqual([saved])
    })

    test('saving again renames it and keeps createdAt', async () => {
      const input = folderInput('Work')
      const first = await folders.save(input)
      const second = await folders.save({
        ...input,
        name: 'Play',
        icon: 'star',
        color: 'brick',
      })
      expect(second).toMatchObject({
        id: input.id,
        name: 'Play',
        icon: 'star',
        color: 'brick',
        createdAt: first.createdAt,
      })
      expect(await folders.list()).toEqual([second])
    })

    test('deleting a missing folder is not an error', async () => {
      await expect(folders.delete(crypto.randomUUID())).resolves.toBeUndefined()
    })

    test('a new drawing is in no folder', async () => {
      const summary = await drawings.save(doc)
      expect(summary.folderId).toBeUndefined()
    })

    test('moves a drawing into a folder and out again', async () => {
      const folder = await folders.save(folderInput('Work'))
      const saved = await drawings.save(doc)

      const moved = await drawings.move(doc.id, folder.id)
      expect(moved).toEqual({ ...saved, folderId: folder.id })
      expect(await drawings.list()).toEqual([moved])

      const out = await drawings.move(doc.id, null)
      expect(out).toEqual(saved)
      expect(out).not.toHaveProperty('folderId')
      expect(await drawings.list()).toEqual([saved])
    })

    test('a move is not an edit: updatedAt and the document stay', async () => {
      const folder = await folders.save(folderInput('Work'))
      const saved = await drawings.save(doc)
      const moved = await drawings.move(doc.id, folder.id)
      expect(moved?.updatedAt).toBe(saved.updatedAt)
      expect(await drawings.get(doc.id)).toEqual(doc)
    })

    test('saving again keeps the folder', async () => {
      const folder = await folders.save(folderInput('Work'))
      await drawings.save(doc)
      await drawings.move(doc.id, folder.id)
      const renamed = { ...doc, name: 'Final' }
      const summary = await drawings.save(renamed)
      expect(summary).toMatchObject({ name: 'Final', folderId: folder.id })
    })

    test('moving a missing drawing resolves undefined', async () => {
      const folder = await folders.save(folderInput('Work'))
      expect(
        await drawings.move(crypto.randomUUID(), folder.id),
      ).toBeUndefined()
      expect(await drawings.move(crypto.randomUUID(), null)).toBeUndefined()
    })

    test('moving into a missing folder rejects and changes nothing', async () => {
      const saved = await drawings.save(doc)
      await expect(drawings.move(doc.id, crypto.randomUUID())).rejects.toThrow()
      expect(await drawings.list()).toEqual([saved])
    })

    test('deleting a folder deletes its drawings and no others', async () => {
      const work = await folders.save(folderInput('Work'))
      const play = await folders.save(folderInput('Play'))
      const inWork = createDocument('In work')
      const inPlay = createDocument('In play')
      const loose = createDocument('Loose')
      for (const d of [inWork, inPlay, loose]) await drawings.save(d)
      await drawings.move(inWork.id, work.id)
      await drawings.move(inPlay.id, play.id)

      await folders.delete(work.id)

      expect(await folders.list()).toEqual([play])
      expect(await drawings.get(inWork.id)).toBeUndefined()
      expect((await drawings.list()).map((s) => s.id).sort()).toEqual(
        [inPlay.id, loose.id].sort(),
      )
      expect(await drawings.get(inPlay.id)).toEqual(inPlay)
      expect(await drawings.get(loose.id)).toEqual(loose)
      // The deleted folder can't be moved into any more.
      await expect(drawings.move(loose.id, work.id)).rejects.toThrow()
    })

    // ADR 0045: saves are upserts (ADR 0032), so a tab that still has the
    // drawing open brings it back, in no folder.
    test('saving a drawing whose folder was deleted re-creates it outside any folder', async () => {
      const folder = await folders.save(folderInput('Work'))
      await drawings.save(doc)
      await drawings.move(doc.id, folder.id)
      await folders.delete(folder.id)

      const summary = await drawings.save(doc)
      expect(summary.folderId).toBeUndefined()
      expect(await drawings.get(doc.id)).toEqual(doc)
      expect((await drawings.list()).sort(byId)).toEqual([summary])
    })
  })
}
