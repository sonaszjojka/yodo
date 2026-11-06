// The behaviour every DrawingRepository must share (ADR 0011). Each
// implementation's test file calls `describeRepositoryContract`; this file is
// not a test file itself, so it never runs on its own.

import { beforeEach, describe, expect, test } from 'vitest'
import {
  createDocument,
  createShape,
  createText,
} from '../core/document/create.ts'
import v1Fixture from '../core/document/fixtures/v1-every-element.json?raw'
import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository } from './repository.ts'

function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id)
}

function drawing(name: string): YodoDocument {
  const doc = createDocument(name)
  return {
    ...doc,
    elements: [createShape('rectangle', { x: 1, y: 2, width: 3, height: 4 })],
  }
}

function withText(name: string, ...texts: string[]): YodoDocument {
  const doc = createDocument(name)
  return {
    ...doc,
    elements: texts.map((text) => ({ ...createText([0, 0]), text })),
  }
}

function withTextFor(doc: YodoDocument, text: string): YodoDocument {
  return { ...doc, elements: [{ ...createText([0, 0]), text }] }
}

export function describeRepositoryContract(
  name: string,
  makeRepository: () => DrawingRepository | Promise<DrawingRepository>,
): void {
  describe(`${name} (DrawingRepository contract)`, () => {
    let repo: DrawingRepository

    beforeEach(async () => {
      repo = await makeRepository()
    })

    test('starts empty', async () => {
      expect(await repo.list()).toEqual([])
      expect(await repo.get(crypto.randomUUID())).toBeUndefined()
    })

    test('returns a saved document', async () => {
      const doc = drawing('Plan')
      const summary = await repo.save(doc)
      expect(summary).toMatchObject({ id: doc.id, name: 'Plan' })
      expect(summary.updatedAt).toBeGreaterThanOrEqual(summary.createdAt)
      expect(await repo.get(doc.id)).toEqual(doc)
    })

    test('lists the summary of a saved document', async () => {
      const doc = drawing('Plan')
      const summary = await repo.save(doc)
      expect(await repo.list()).toEqual([summary])
    })

    test('saving again replaces the drawing and keeps createdAt', async () => {
      const doc = drawing('Draft')
      const first = await repo.save(doc)
      const changed = { ...doc, name: 'Final', elements: [] }
      const second = await repo.save(changed)

      expect(second).toMatchObject({ id: doc.id, name: 'Final' })
      expect(second.createdAt).toBe(first.createdAt)
      expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
      expect(await repo.get(doc.id)).toEqual(changed)
      expect(await repo.list()).toEqual([second])
    })

    test('deletes a drawing from get and list', async () => {
      const doc = drawing('Gone')
      await repo.save(doc)
      await repo.delete(doc.id)
      expect(await repo.get(doc.id)).toBeUndefined()
      expect(await repo.list()).toEqual([])
    })

    test('deleting a missing drawing is not an error', async () => {
      await expect(repo.delete(crypto.randomUUID())).resolves.toBeUndefined()
    })

    test('keeps drawings independent', async () => {
      const a = drawing('A')
      const b = drawing('B')
      const c = drawing('C')
      const summaries = await Promise.all([a, b, c].map((d) => repo.save(d)))
      await repo.delete(b.id)

      const kept = summaries.filter((s) => s.id !== b.id)
      expect((await repo.list()).sort(byId)).toEqual(kept.sort(byId))
      expect(await repo.get(a.id)).toEqual(a)
      expect(await repo.get(c.id)).toEqual(c)
    })

    test('changing a saved or returned document does not change the stored one', async () => {
      const doc = drawing('Original')
      const copy = structuredClone(doc)
      await repo.save(doc)
      doc.name = 'Changed after save'
      doc.elements.length = 0

      const loaded = await repo.get(copy.id)
      expect(loaded).toEqual(copy)
      loaded!.elements.length = 0
      expect(await repo.get(copy.id)).toEqual(copy)
    })

    test('a save that fails stores nothing', async () => {
      // A function can't be stored (structured clone throws DataCloneError).
      const bad = {
        ...drawing('Bad'),
        elements: [() => {}],
      } as unknown as YodoDocument
      await expect(repo.save(bad)).rejects.toThrow()
      expect(await repo.list()).toEqual([])
      expect(await repo.get(bad.id)).toBeUndefined()
    })

    test('loads every element type of a v1 document unchanged', async () => {
      const doc = JSON.parse(v1Fixture) as YodoDocument
      await repo.save(doc)
      expect(await repo.get(doc.id)).toEqual(doc)
    })

    describe('Search index (ADR 0047)', () => {
      test('is empty for an empty repository', async () => {
        expect(await repo.searchIndex()).toEqual([])
      })

      test('holds the canvas text of the latest save, "" when there is none', async () => {
        const text = withText('Notes', 'budget', 'plan')
        const plain = drawing('Plain')
        await repo.save(text)
        await repo.save(plain)

        expect((await repo.searchIndex()).sort(byId)).toEqual(
          [
            { id: text.id, searchText: 'budget\nplan' },
            { id: plain.id, searchText: '' },
          ].sort(byId),
        )

        await repo.save({ ...text, elements: [] })
        expect(await repo.searchIndex()).toContainEqual({
          id: text.id,
          searchText: '',
        })
      })

      test('leaves the text out of the summaries', async () => {
        const doc = withText('Notes', 'budget')
        const summary = await repo.save(doc)
        expect(summary).not.toHaveProperty('searchText')
        expect(await repo.list()).toEqual([summary])
      })

      test('leaves trashed drawings out and takes a restored one back', async () => {
        const doc = withText('Notes', 'budget')
        await repo.save(doc)
        await repo.trash(doc.id)
        expect(await repo.searchIndex()).toEqual([])

        await repo.restore(doc.id)
        expect(await repo.searchIndex()).toEqual([
          { id: doc.id, searchText: 'budget' },
        ])
      })

      test('saving a trashed drawing keeps it out and updates its text', async () => {
        const doc = withText('Notes', 'old')
        await repo.save(doc)
        await repo.trash(doc.id)
        await repo.save(withTextFor(doc, 'new'))
        expect(await repo.searchIndex()).toEqual([])
        await repo.restore(doc.id)
        expect(await repo.searchIndex()).toEqual([
          { id: doc.id, searchText: 'new' },
        ])
      })

      test('forgets deleted drawings and emptied Trash', async () => {
        const gone = withText('Gone', 'a')
        const emptied = withText('Emptied', 'b')
        await repo.save(gone)
        await repo.save(emptied)
        await repo.delete(gone.id)
        await repo.trash(emptied.id)
        await repo.emptyTrash()
        expect(await repo.searchIndex()).toEqual([])

        // Saving the same id again must not bring the old text back.
        await repo.save({ ...emptied, elements: [] })
        expect(await repo.searchIndex()).toEqual([
          { id: emptied.id, searchText: '' },
        ])
      })

      test('keeps long text whole', async () => {
        const long = `start ${'lorem ipsum '.repeat(2000)}the end`
        const doc = withText('Long', long)
        await repo.save(doc)
        expect(await repo.searchIndex()).toEqual([
          { id: doc.id, searchText: long },
        ])
      })

      test('keeps non-ASCII text and cleans lone surrogates without failing the save', async () => {
        const doc = withText('Odd', 'zażółć 😀\nline', 'a\uD800b')
        await repo.save(doc)
        expect(await repo.searchIndex()).toEqual([
          { id: doc.id, searchText: 'zażółć 😀\nline\na\uFFFDb' },
        ])
        expect(await repo.get(doc.id)).toEqual(doc)
      })
    })

    describe('Trash (ADR 0046)', () => {
      test('starts with an empty Trash', async () => {
        expect(await repo.listTrash()).toEqual([])
      })

      test('trashing hides a drawing from list and shows it in Trash', async () => {
        const doc = drawing('Plan')
        const saved = await repo.save(doc)
        const trashed = await repo.trash(doc.id)

        expect(trashed).toMatchObject({ id: doc.id, name: 'Plan' })
        expect(trashed?.deletedAt).toBeGreaterThan(0)
        // Trashing is not an edit.
        expect(trashed?.updatedAt).toBe(saved.updatedAt)
        expect(trashed?.createdAt).toBe(saved.createdAt)
        expect(await repo.list()).toEqual([])
        expect(await repo.listTrash()).toEqual([trashed])
        // The document stays, so a restore brings the drawing back whole.
        expect(await repo.get(doc.id)).toEqual(doc)
      })

      test('restoring brings the drawing back, live and unchanged', async () => {
        const doc = drawing('Plan')
        const saved = await repo.save(doc)
        await repo.trash(doc.id)
        const restored = await repo.restore(doc.id)

        expect(restored).toEqual(saved)
        expect(restored).not.toHaveProperty('deletedAt')
        expect(await repo.list()).toEqual([saved])
        expect(await repo.listTrash()).toEqual([])
      })

      test('trashing or restoring a missing drawing resolves undefined', async () => {
        expect(await repo.trash(crypto.randomUUID())).toBeUndefined()
        expect(await repo.restore(crypto.randomUUID())).toBeUndefined()
      })

      test('trashing twice keeps the first deletedAt; restoring a live drawing changes nothing', async () => {
        const doc = drawing('Plan')
        const saved = await repo.save(doc)
        expect(await repo.restore(doc.id)).toEqual(saved)
        const first = await repo.trash(doc.id)
        const second = await repo.trash(doc.id)
        expect(second).toEqual(first)
      })

      test('saving a trashed drawing keeps it in Trash', async () => {
        const doc = drawing('Draft')
        await repo.save(doc)
        const trashed = await repo.trash(doc.id)
        const saved = await repo.save({ ...doc, name: 'Final' })

        expect(saved).toMatchObject({
          name: 'Final',
          deletedAt: trashed?.deletedAt,
        })
        expect(await repo.list()).toEqual([])
        expect(await repo.listTrash()).toEqual([saved])
      })

      test('delete removes a trashed drawing for good', async () => {
        const doc = drawing('Gone')
        await repo.save(doc)
        await repo.trash(doc.id)
        await repo.delete(doc.id)
        expect(await repo.get(doc.id)).toBeUndefined()
        expect(await repo.listTrash()).toEqual([])
      })

      test('emptyTrash removes every trashed drawing and no live one', async () => {
        const live = drawing('Live')
        const a = drawing('A')
        const b = drawing('B')
        const liveSummary = await repo.save(live)
        for (const d of [a, b]) {
          await repo.save(d)
          await repo.trash(d.id)
        }

        await repo.emptyTrash()

        expect(await repo.listTrash()).toEqual([])
        expect(await repo.get(a.id)).toBeUndefined()
        expect(await repo.get(b.id)).toBeUndefined()
        expect(await repo.list()).toEqual([liveSummary])
        expect(await repo.get(live.id)).toEqual(live)
      })

      test('emptying an empty Trash is not an error', async () => {
        await expect(repo.emptyTrash()).resolves.toBeUndefined()
      })

      // The retention sweep: the check and the delete are one step, so a
      // drawing restored or trashed again meanwhile is not lost.
      test('emptyTrash with a cutoff removes only drawings trashed before it', async () => {
        const doc = drawing('Plan')
        await repo.save(doc)
        const trashed = await repo.trash(doc.id)
        const at = trashed!.deletedAt!

        await repo.emptyTrash({ deletedBefore: at })
        expect(await repo.listTrash()).toEqual([trashed])

        await repo.emptyTrash({ deletedBefore: at + 1 })
        expect(await repo.listTrash()).toEqual([])
        expect(await repo.get(doc.id)).toBeUndefined()
      })

      test('a sweep never removes a restored drawing, even with a stale cutoff', async () => {
        const doc = drawing('Plan')
        const saved = await repo.save(doc)
        const trashed = await repo.trash(doc.id)
        await repo.restore(doc.id)

        await repo.emptyTrash({ deletedBefore: trashed!.deletedAt! + 1 })

        expect(await repo.list()).toEqual([saved])
        expect(await repo.get(doc.id)).toEqual(doc)
      })

      test('a sweep skips a drawing trashed again after the cutoff', async () => {
        const doc = drawing('Plan')
        await repo.save(doc)
        const first = await repo.trash(doc.id)
        await repo.restore(doc.id)
        // A cutoff that is just before the second trash, whatever its time.
        const cutoff = first!.deletedAt!
        const second = await repo.trash(doc.id)
        expect(second!.deletedAt!).toBeGreaterThanOrEqual(cutoff)

        await repo.emptyTrash({ deletedBefore: cutoff })
        expect(await repo.listTrash()).toEqual([second])
      })

      test('moving a trashed drawing keeps it in Trash', async () => {
        const doc = drawing('Plan')
        await repo.save(doc)
        const trashed = await repo.trash(doc.id)
        expect(await repo.move(doc.id, null)).toEqual(trashed)
      })
    })

    // Ids are UUIDs when the app creates them, but an imported document
    // carries its own. A URL must not read them as path segments. ("." and
    // ".." can't be path segments at all; HttpDrawingRepository refuses them.)
    test.each(['a/b', '%2E'])(
      'stores and deletes a drawing with the id %j',
      async (id) => {
        const doc = { ...drawing('Odd id'), id }
        await repo.save(doc)
        expect(await repo.get(id)).toEqual(doc)
        expect((await repo.list()).map((s) => s.id)).toEqual([id])
        await repo.delete(id)
        expect(await repo.get(id)).toBeUndefined()
        expect(await repo.list()).toEqual([])
      },
    )
  })
}
