import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { createEditor, type Editor } from '../core/editor/editor.ts'
import { createAutoSaver, type AutoSaver } from './autosave.ts'
import { InMemoryDrawingRepository } from './memory.ts'
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
    get: async () => undefined,
    delete: async () => {},
    save: (doc) =>
      new Promise((resolve, reject) => {
        saves.push({
          doc,
          resolve: () =>
            resolve({ id: doc.id, name: doc.name, createdAt: 0, updatedAt: 0 }),
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
