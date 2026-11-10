import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { createEditor, type Editor } from '../core/editor/editor.ts'
import {
  createAutoSaver,
  finalSave,
  withFileIds,
  type AutoSaver,
} from './autosave.ts'
import {
  InMemoryDrawingRepository,
  InMemoryFolderRepository,
  MemoryData,
} from './memory.ts'
import type { DrawingRepository } from './repository.ts'

const DELAY = 1000

let editor: Editor
let repository: InMemoryDrawingRepository
let saver: AutoSaver
let stop: () => void

function setUp(repo: DrawingRepository = repository) {
  saver = createAutoSaver(editor.store, repo, { delay: DELAY })
  stop = saver.start()
}

/** A document change, as an edit would make (a new `document` reference). */
function change(name: string) {
  editor.store.setState((s) => ({ ...s, document: { ...s.document, name } }))
}

/** A repository whose saves wait until the test resolves them. */
function deferredRepository() {
  const saves: {
    doc: YodoDocument
    resolve(): void
    reject(e: Error): void
  }[] = []
  const repo: DrawingRepository = {
    list: async () => [],
    listTrash: async () => [],
    searchIndex: async () => [],
    get: async () => undefined,
    getWithRevision: async () => undefined,
    getRevision: async () => undefined,
    delete: async () => {},
    move: async () => undefined,
    trash: async () => undefined,
    restore: async () => undefined,
    emptyTrash: async () => {},
    save: (doc) =>
      new Promise((resolve, reject) => {
        saves.push({
          doc,
          resolve: () =>
            resolve({
              id: doc.id,
              name: doc.name,
              createdAt: 0,
              updatedAt: 0,
              revision: 1,
            }),
          reject,
        })
      }),
  }
  return { repo, saves }
}

beforeEach(() => {
  vi.useFakeTimers()
  editor = createEditor(createDocument())
  repository = new InMemoryDrawingRepository()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

test('starts as saved and saves nothing without a change', async () => {
  setUp()
  await vi.advanceTimersByTimeAsync(DELAY * 2)

  expect(saver.status.getState()).toBe('saved')
  expect(await repository.list()).toEqual([])
})

test('saves once, a delay after the last of several quick changes', async () => {
  const save = vi.spyOn(repository, 'save')
  setUp()

  change('a')
  expect(saver.status.getState()).toBe('unsaved')
  await vi.advanceTimersByTimeAsync(DELAY - 1)
  change('b')
  await vi.advanceTimersByTimeAsync(DELAY - 1)
  expect(save).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(1)

  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0].name).toBe('b')
  expect(saver.status.getState()).toBe('saved')
})

test('copies the current viewport into appState', async () => {
  setUp()
  editor.panBy(30, 40)
  change('a')
  await vi.advanceTimersByTimeAsync(DELAY)

  const saved = await repository.get(editor.store.getState().document.id)
  expect(saved?.appState.viewport).toEqual(editor.store.getState().viewport)
  expect(saved?.appState.viewport).not.toEqual({ x: 0, y: 0, zoom: 1 })
})

test('a pan or zoom alone does not save', async () => {
  const save = vi.spyOn(repository, 'save')
  setUp()

  editor.panBy(30, 40)
  editor.setZoom(2, [0, 0])
  await vi.advanceTimersByTimeAsync(DELAY * 2)

  expect(save).not.toHaveBeenCalled()
  expect(saver.status.getState()).toBe('saved')
})

test('undoing back to the saved document needs no save', async () => {
  const save = vi.spyOn(repository, 'save')
  setUp()
  const original = editor.store.getState().document

  change('a')
  editor.store.setState((s) => ({ ...s, document: original }))
  expect(saver.status.getState()).toBe('saved')
  await vi.advanceTimersByTimeAsync(DELAY)

  expect(save).not.toHaveBeenCalled()
})

test('a change during a save waits for it, then saves the latest once', async () => {
  const { repo, saves } = deferredRepository()
  setUp(repo)

  change('a')
  await vi.advanceTimersByTimeAsync(DELAY)
  expect(saves).toHaveLength(1)
  expect(saver.status.getState()).toBe('saving')

  change('b')
  change('c')
  await vi.advanceTimersByTimeAsync(DELAY)
  // The first save is still running, so no second one has started.
  expect(saves).toHaveLength(1)

  saves[0]!.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(saves).toHaveLength(2)
  expect(saves[1]!.doc.name).toBe('c')

  saves[1]!.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(saver.status.getState()).toBe('saved')
})

test('a failed save shows an error, and the next change retries', async () => {
  const { repo, saves } = deferredRepository()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  setUp(repo)

  change('a')
  await vi.advanceTimersByTimeAsync(DELAY)
  saves[0]!.reject(new Error('offline'))
  await vi.advanceTimersByTimeAsync(0)
  expect(saver.status.getState()).toBe('error')
  expect(error).toHaveBeenCalled()

  change('b')
  // Still an error until the retry starts.
  expect(saver.status.getState()).toBe('error')
  await vi.advanceTimersByTimeAsync(DELAY)
  expect(saves).toHaveLength(2)
  saves[1]!.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(saver.status.getState()).toBe('saved')
})

test('flush saves a pending change at once', async () => {
  setUp()
  change('a')

  await saver.flush()

  const saved = await repository.get(editor.store.getState().document.id)
  expect(saved?.name).toBe('a')
  expect(saver.status.getState()).toBe('saved')
})

test('after stop, changes are not saved', async () => {
  const save = vi.spyOn(repository, 'save')
  setUp()
  stop()

  change('a')
  await vi.advanceTimersByTimeAsync(DELAY * 2)

  expect(save).not.toHaveBeenCalled()
})

test('after a failed save, undoing back to the saved document shows saved', async () => {
  const { repo, saves } = deferredRepository()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  setUp(repo)
  const original = editor.store.getState().document

  change('a')
  await vi.advanceTimersByTimeAsync(DELAY)
  saves[0]!.reject(new Error('offline'))
  await vi.advanceTimersByTimeAsync(0)
  expect(saver.status.getState()).toBe('error')

  editor.store.setState((s) => ({ ...s, document: original }))
  await vi.advanceTimersByTimeAsync(DELAY)

  expect(saver.status.getState()).toBe('saved')
  expect(saves).toHaveLength(1)
})

test('finalSave resolves true once the pending change is saved', async () => {
  setUp()
  change('kept')

  expect(await finalSave(saver)).toBe(true)
  expect(
    (await repository.get(editor.store.getState().document.id))?.name,
  ).toBe('kept')
})

test('finalSave resolves false when the last save fails, so the loss can be shown', async () => {
  const failing = new InMemoryDrawingRepository()
  failing.save = () => Promise.reject(new Error('offline'))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  setUp(failing)
  change('lost')

  expect(await finalSave(saver)).toBe(false)
  error.mockRestore()
})

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const VIEW = { x: 0, y: 0, width: 1000, height: 800 }

test('saves fileIds from the image elements: sorted, without repeats', async () => {
  setUp()
  editor.addImage({ fileId: B, width: 10, height: 10 }, VIEW)
  editor.addImage({ fileId: A, width: 10, height: 10 }, VIEW)
  editor.addImage({ fileId: B, width: 10, height: 10 }, VIEW)
  await vi.advanceTimersByTimeAsync(DELAY)

  const stored = await repository.get(editor.store.getState().document.id)
  expect(stored?.fileIds).toEqual([A, B])
})

test('drops a fileId once its last image is removed', async () => {
  setUp()
  editor.addImage({ fileId: A, width: 10, height: 10 }, VIEW)
  await vi.advanceTimersByTimeAsync(DELAY)
  editor.deleteSelected()
  await vi.advanceTimersByTimeAsync(DELAY)

  const stored = await repository.get(editor.store.getState().document.id)
  expect(stored?.fileIds).toEqual([])
})

test('withFileIds returns the same document when the list is already right', () => {
  const doc = createDocument()
  expect(withFileIds(doc)).toBe(doc)
})

describe('revisions and conflicts (ADR 0062)', () => {
  /** The editor's drawing, stored at revision 1 by "this tab". */
  async function stored() {
    const doc = editor.store.getState().document
    await repository.save(doc)
    return doc
  }

  /** Another tab or agent saves the drawing: it moves to revision 2. */
  async function savedElsewhere(doc: YodoDocument) {
    await repository.save({ ...doc, name: 'Theirs' })
  }

  function setUpAt(revision: number, repo: DrawingRepository = repository) {
    saver = createAutoSaver(editor.store, repo, { delay: DELAY, revision })
    stop = saver.start()
  }

  function copies() {
    return repository
      .list()
      .then((all) => all.filter((s) => s.name.endsWith('(conflicted copy)')))
  }

  test('each save expects the last revision and advances it', async () => {
    const doc = await stored()
    const save = vi.spyOn(repository, 'save')
    setUpAt(1)

    change('a')
    await vi.advanceTimersByTimeAsync(DELAY)
    change('b')
    await vi.advanceTimersByTimeAsync(DELAY)

    expect(save.mock.calls.map(([, options]) => options)).toEqual([
      { expectedRevision: 1 },
      { expectedRevision: 2 },
    ])
    expect(saver.revision()).toBe(3)
    expect(await repository.getRevision(doc.id)).toBe(3)
  })

  test('a conflict saves the local version as a copy and leaves theirs', async () => {
    const doc = await stored()
    setUpAt(1)
    await savedElsewhere(doc)

    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)

    expect((await repository.get(doc.id))?.name).toBe('Theirs')
    const [copy] = await copies()
    expect(copy?.name).toBe('Mine (conflicted copy)')
    expect(saver.conflict()).toEqual({ copyId: copy!.id, saved: true })
    expect(saver.status.getState()).toBe('saved')
    const saved = await repository.get(copy!.id)
    expect(saved?.elements).toEqual(editor.store.getState().document.elements)
  })

  test('after a conflict every later save goes to the same copy', async () => {
    const doc = await stored()
    setUpAt(1)
    await savedElsewhere(doc)
    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)

    change('Mine later')
    expect(await finalSave(saver)).toBe(true)

    const all = await copies()
    expect(all.map((s) => s.name)).toEqual(['Mine later (conflicted copy)'])
    expect((await repository.get(doc.id))?.name).toBe('Theirs')
    expect(saver.conflict()).toMatchObject({ saved: true })
  })

  test('the copy goes into the original drawing’s folder', async () => {
    const data = new MemoryData()
    repository = new InMemoryDrawingRepository({ data })
    const folders = new InMemoryFolderRepository({ data })
    const doc = await stored()
    await folders.save({
      id: 'f',
      name: 'Work',
      icon: 'folder',
      color: 'graphite',
    })
    await repository.move(doc.id, 'f')
    setUpAt(1)
    await savedElsewhere(doc)

    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)

    expect((await copies())[0]?.folderId).toBe('f')
  })

  test('an edit made while the copy is being saved ends up in the copy', async () => {
    const doc = await stored()
    // Copy saves wait until the test releases them.
    const release: (() => void)[] = []
    const realSave = repository.save.bind(repository)
    vi.spyOn(repository, 'save').mockImplementation((d, options) =>
      d.id === doc.id
        ? realSave(d, options)
        : new Promise((resolve) => release.push(() => resolve(realSave(d)))),
    )
    setUpAt(1)
    await savedElsewhere(doc)

    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(release).toHaveLength(1)
    change('Mine, edited during the copy')
    release.shift()!()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(DELAY)
    release.shift()?.()
    await vi.advanceTimersByTimeAsync(0)

    expect((await copies()).map((s) => s.name)).toEqual([
      'Mine, edited during the copy (conflicted copy)',
    ])
    expect(saver.isDirty()).toBe(false)
  })

  test('a failed copy save is an error that retries into the same copy', async () => {
    const doc = await stored()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let failCopies = true
    const realSave = repository.save.bind(repository)
    vi.spyOn(repository, 'save').mockImplementation((d, options) =>
      d.id !== doc.id && failCopies
        ? Promise.reject(new Error('quota'))
        : realSave(d, options),
    )
    setUpAt(1)
    await savedElsewhere(doc)

    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(saver.status.getState()).toBe('error')
    expect(saver.conflict()?.saved).toBe(false)
    const copyId = saver.conflict()!.copyId
    // Closing now would lose the local version, so finalSave says so.
    expect(await finalSave(saver)).toBe(false)

    failCopies = false
    change('Mine again')
    expect(await finalSave(saver)).toBe(true)
    expect(saver.conflict()).toEqual({ copyId, saved: true })
    expect((await copies()).map((s) => s.id)).toEqual([copyId])
    error.mockRestore()
  })

  test('a drawing deleted elsewhere is kept as a copy too', async () => {
    const doc = await stored()
    setUpAt(1)
    await repository.delete(doc.id)

    change('Mine')
    await vi.advanceTimersByTimeAsync(DELAY)

    expect((await copies()).map((s) => s.name)).toEqual([
      'Mine (conflicted copy)',
    ])
    expect(await repository.get(doc.id)).toBeUndefined()
  })
})
