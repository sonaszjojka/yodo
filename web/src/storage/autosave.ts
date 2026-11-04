// Auto-save (ADR 0032): watches the editor store and saves the document through
// the repository a short delay after the last change. Saves run one at a time,
// so an older one can never land after a newer one.

import type { EditorState } from '../core/editor/editor.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { createStore, type Store } from '../core/store/store.ts'
import type { DrawingRepository } from './repository.ts'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export interface AutoSaver {
  /** For the bottom bar. */
  status: Store<SaveStatus>
  /** Starts watching the editor; returns a function that stops it. */
  start(): () => void
  /** Saves a pending change now; resolves once it is saved or has failed. */
  flush(): Promise<void>
}

export interface AutoSaverOptions {
  /** Milliseconds after the last change before saving. */
  delay?: number
}

export const AUTO_SAVE_DELAY = 1000

export function createAutoSaver(
  editor: Store<EditorState>,
  repository: DrawingRepository,
  { delay = AUTO_SAVE_DELAY }: AutoSaverOptions = {},
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
      await repository.save({
        ...document,
        appState: { ...document.appState, viewport },
      })
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
