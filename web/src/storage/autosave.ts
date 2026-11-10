// Auto-save (ADR 0032): watches the editor store and saves the document through
// the repository a short delay after the last change. Saves run one at a time,
// so an older one can never land after a newer one. Each save expects the
// revision of the last one; when another writer saved first, the local
// version goes to a conflicted copy instead (ADR 0062).

import type { EditorState } from '../core/editor/editor.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { createStore, type Store } from '../core/store/store.ts'
import { randomId } from '../core/document/create.ts'
import { RevisionConflictError, type DrawingRepository } from './repository.ts'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export interface AutoSaver {
  /** For the bottom bar. */
  status: Store<SaveStatus>
  /** Starts watching the editor; returns a function that stops it. */
  start(): () => void
  /** Saves a pending change now; resolves once it is saved or has failed. */
  flush(): Promise<void>
  /** The revision of the last save, or the one the editor opened at. */
  revision(): number | undefined
  /** Whether the editor has a change not saved yet. */
  isDirty(): boolean
  /**
   * Set once a save found a newer version elsewhere (ADR 0062): from then on
   * every save goes to the copy `copyId`. `saved` is whether it is stored yet.
   */
  conflict(): ConflictedCopy | undefined
}

export interface ConflictedCopy {
  copyId: string
  saved: boolean
}

export interface AutoSaverOptions {
  /** Milliseconds after the last change before saving. */
  delay?: number
  /**
   * The stored revision of the document the editor opened. Without it the
   * first save is unconditional, and later ones expect its revision.
   */
  revision?: number
}

/** The name of a conflicted copy of a drawing called `name`. */
export function conflictedCopyName(name: string): string {
  return `${name} (conflicted copy)`
}

export const AUTO_SAVE_DELAY = 1000

/**
 * The document with `fileIds` set to the images its elements use: sorted,
 * without repeats (ADR 0013, 0040). Applied when saving, so the stored list
 * always matches the elements; unchanged if it already does.
 */
export function withFileIds(doc: YodoDocument): YodoDocument {
  const ids = new Set<string>()
  for (const element of doc.elements) {
    if (element.type === 'image') ids.add(element.fileId)
  }
  const fileIds = [...ids].sort()
  const same =
    fileIds.length === doc.fileIds.length &&
    fileIds.every((id, i) => id === doc.fileIds[i])
  return same ? doc : { ...doc, fileIds }
}

export function createAutoSaver(
  editor: Store<EditorState>,
  repository: DrawingRepository,
  { delay = AUTO_SAVE_DELAY, revision }: AutoSaverOptions = {},
): AutoSaver {
  // The editor starts on a document that is already stored (or a new, empty
  // one, which needs no save until it changes).
  let saved: YodoDocument = editor.getState().document
  let seen = saved
  let saving = false
  let failed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Every save is chained on the previous one, so they never overlap.
  let chain: Promise<void> = Promise.resolve()
  // A save is waiting on the chain; further flushes join it instead of
  // queueing another, so a burst of changes during a save is saved once.
  let queued = false
  const status = createStore<SaveStatus>('saved')
  let copy: ConflictedCopy | undefined

  const dirty = () => editor.getState().document !== saved

  function update() {
    // Back on the stored document (e.g. undo): an earlier failure no longer
    // applies, and the next change should show as unsaved, not failed.
    if (!dirty()) failed = false
    status.setState(
      saving ? 'saving' : failed ? 'error' : dirty() ? 'unsaved' : 'saved',
    )
  }

  async function saveOnce() {
    queued = false
    if (!dirty()) return
    // Read when the save starts, so it carries the latest document and view.
    const { document, viewport } = editor.getState()
    saving = true
    update()
    try {
      const doc = withFileIds({
        ...document,
        appState: { ...document.appState, viewport },
      })
      if (!copy) {
        try {
          const summary = await repository.save(
            doc,
            revision === undefined ? {} : { expectedRevision: revision },
          )
          revision = summary.revision
        } catch (error) {
          if (!(error instanceof RevisionConflictError)) throw error
          // Someone else saved first, or deleted the drawing. Their version
          // stays; this one, and every later edit, goes to a copy.
          copy = { copyId: randomId(), saved: false }
        }
      }
      if (copy) await saveCopy(doc, copy)
      saved = document
      failed = false
    } catch (error) {
      failed = true
      console.error('Auto-save failed', error)
    } finally {
      saving = false
      update()
    }
  }

  async function saveCopy(doc: YodoDocument, target: ConflictedCopy) {
    // Unconditional: the id is new, so nobody else writes to it.
    await repository.save({
      ...doc,
      id: target.copyId,
      name: conflictedCopyName(doc.name),
    })
    if (target.saved) return
    target.saved = true
    try {
      // Next to the original. A failure only leaves it outside any folder.
      const original = (await repository.list()).find((s) => s.id === doc.id)
      if (original?.folderId !== undefined) {
        await repository.move(target.copyId, original.folderId)
      }
    } catch (error) {
      console.error('Could not move the conflicted copy', error)
    }
  }

  function flush() {
    clearTimeout(timer)
    timer = undefined
    if (!queued) {
      queued = true
      // saveOnce catches its own errors, so the chain never rejects.
      chain = chain.then(saveOnce)
    }
    return chain
  }

  function onChange() {
    const { document } = editor.getState()
    // Only a new document is a change; pans, selection and drags are not.
    if (document === seen) return
    seen = document
    update()
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  }

  return {
    status,
    start() {
      const unsubscribe = editor.subscribe(onChange)
      return () => {
        unsubscribe()
        clearTimeout(timer)
        timer = undefined
      }
    },
    flush,
    revision: () => revision,
    isDirty: dirty,
    conflict: () => copy && { ...copy },
  }
}

/**
 * Flushes a closing editor's save and resolves whether it succeeded. The
 * status store goes away with the editor, so the next screen needs the
 * outcome to show that the last changes were lost.
 */
export async function finalSave(saver: AutoSaver): Promise<boolean> {
  await saver.flush()
  return saver.status.getState() !== 'error'
}
