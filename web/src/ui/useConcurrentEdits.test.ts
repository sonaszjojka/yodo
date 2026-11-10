import { afterEach, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { createAutoSaver } from '../storage/autosave.ts'
import { InMemoryDrawingRepository } from '../storage/memory.ts'
import {
  createReloadController,
  UPDATED_NOTICE,
  type ConcurrentEditsOptions,
  type ReloadController,
} from './useConcurrentEdits.ts'

let controller: ReloadController | undefined
afterEach(() => controller?.dispose())

/** An editor at revision 1 of a stored drawing, and its reload controller. */
async function setUp() {
  const repository = new InMemoryDrawingRepository()
  const doc = createDocument('Plan')
  await repository.save(doc)
  const editor = createEditor(doc)
  const saver = createAutoSaver(editor.store, repository, {
    delay: 60_000,
    revision: 1,
  })
  const stop = saver.start()
  const onReload = vi.fn()
  const showNotice = vi.fn()
  const options: ConcurrentEditsOptions = {
    repository,
    id: doc.id,
    saver,
    settled: async () => {},
    busy: () => false,
    onReload,
    showNotice,
  }
  controller = createReloadController(saver, () => options)
  const edit = (name: string) =>
    editor.store.setState((s) => ({ ...s, document: { ...s.document, name } }))
  return { repository, doc, editor, saver, stop, onReload, showNotice, edit }
}

test('focus with a newer version reloads with the updated notice', async () => {
  const { repository, doc, onReload } = await setUp()
  await repository.save({ ...doc, name: 'Theirs' })

  await controller!.check()

  expect(onReload).toHaveBeenCalledOnce()
  expect(onReload.mock.calls[0]![1]).toEqual(UPDATED_NOTICE)
})

// The edit is committed while the revision check is in flight, so the
// barrier's flush turns it into a conflicted copy; the notice must say so
// (Codex review round 1, finding 2).
test('a conflict found during a focus reload keeps the copy notice', async () => {
  const { repository, doc, onReload, edit } = await setUp()
  await repository.save({ ...doc, name: 'Theirs' })
  const getRevision = repository.getRevision.bind(repository)
  repository.getRevision = async (id) => {
    edit('Mine')
    return getRevision(id)
  }

  await controller!.check()

  expect(onReload).toHaveBeenCalledOnce()
  const notice = onReload.mock.calls[0]![1]
  expect(notice.action?.label).toBe('Open copy')
  const copies = (await repository.list()).filter((s) =>
    s.name.endsWith('(conflicted copy)'),
  )
  expect(notice.action?.href).toBe(`#/d/${copies[0]!.id}`)
})
