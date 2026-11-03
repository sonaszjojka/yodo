// The behaviour every DrawingRepository must share (ADR 0011). Each
// implementation's test file calls `describeRepositoryContract`; this file is
// not a test file itself, so it never runs on its own.

import { beforeEach, describe, expect, test } from 'vitest'
import { createDocument, createShape } from '../core/document/create.ts'
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
