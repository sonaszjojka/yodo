// The editor's side of safe concurrent saves (ADR 0062): after a conflict, or
// on focus when the stored drawing is newer, it swaps in the stored version,
// but only through the reload barrier, so no local edit is ever dropped.

import { useEffect, useRef } from 'react'
import type { AutoSaver } from '../storage/autosave.ts'
import {
  isNewerElsewhere,
  prepareReload,
  type LoadedDrawing,
} from '../storage/drawings.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import type { NoticeAction } from './Notice.tsx'
import { routeHash } from './route.ts'

export interface EditorNotice {
  message: string
  tone?: 'error' | 'info'
  action?: NoticeAction
}

export const UPDATED_NOTICE: EditorNotice = {
  message: 'Updated with changes made elsewhere.',
  tone: 'info',
}

export function conflictNotice(copyId: string): EditorNotice {
  return {
    message:
      'This drawing was changed elsewhere. Your version was saved as a copy.',
    tone: 'info',
    action: {
      label: 'Open copy',
      href: routeHash({ name: 'drawing', id: copyId }),
    },
  }
}

export const COPY_FAILED_NOTICE: EditorNotice = {
  message:
    'This drawing was changed elsewhere, and your version couldn’t be saved as a copy yet. It’s retried on your next edit.',
}

export interface ConcurrentEditsOptions {
  repository: DrawingRepository
  id: string
  saver: AutoSaver
  /** Resolves once image uploads have landed in the drawing. */
  settled(): Promise<void>
  /** Whether the editor holds work outside the document (text being typed). */
  busy(): boolean
  /** Swaps the editor for the stored version; undo starts afresh. */
  onReload?(loaded: LoadedDrawing, notice: EditorNotice): void
  showNotice(notice: EditorNotice): void
}

/**
 * Wires the saver and the window's focus to reloads. A conflicted copy is
 * noticed from the saver itself: its status turns `saved` with `conflict()`
 * set. Everything lives in one effect, so a reload never acts on a closed
 * editor.
 */
export function useConcurrentEdits(options: ConcurrentEditsOptions): void {
  // The latest props, so the long-lived listeners below never go stale.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    const { saver } = latest.current
    let disposed = false
    // A reload still waiting for the barrier, and the copy already announced.
    let pending: EditorNotice | undefined
    let announced: string | undefined
    let reloading = false
    let checking = false

    /** Tries the barrier once; true if the editor was handed the new version. */
    async function reload(notice: EditorNotice): Promise<boolean> {
      const { repository, id, settled, busy, onReload } = latest.current
      if (reloading || !onReload) return false
      reloading = true
      try {
        const loaded = await prepareReload({
          repository,
          id,
          saver,
          settled,
          busy,
        })
        if (loaded === 'blocked' || disposed) return false
        onReload(loaded, notice)
        return true
      } finally {
        reloading = false
      }
    }

    async function retryPending() {
      if (pending && (await reload(pending))) pending = undefined
    }

    // A reload blocked by unsaved edits is tried again once they are saved;
    // a copy that failed to save is reported.
    let previous = saver.status.getState()
    const unsubscribe = saver.status.subscribe(() => {
      const status = saver.status.getState()
      if (status === previous) return
      previous = status
      const copy = saver.conflict()
      if (status === 'error' && copy && !copy.saved) {
        latest.current.showNotice(COPY_FAILED_NOTICE)
      }
      if (status !== 'saved') return
      if (copy?.saved && announced !== copy.copyId) {
        announced = copy.copyId
        pending = conflictNotice(copy.copyId)
        latest.current.showNotice(pending)
      }
      void retryPending()
    })

    async function check() {
      if (checking) return
      checking = true
      try {
        const { repository, id } = latest.current
        // Local changes first: a stale save then conflicts, and the copy
        // path takes over. After a conflict this only retries the copy.
        await saver.flush()
        if (saver.conflict()) {
          await retryPending()
          return
        }
        const known = saver.revision()
        if (known === undefined || disposed) return
        if (await isNewerElsewhere(repository, id, known)) {
          await reload(UPDATED_NOTICE)
        }
      } catch (error) {
        console.error('Could not check for a newer version', error)
      } finally {
        checking = false
      }
    }
    const onFocus = () => void check()
    const onVisibility = () => {
      if (window.document.visibilityState === 'visible') void check()
    }
    window.addEventListener('focus', onFocus)
    window.document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      unsubscribe()
      window.removeEventListener('focus', onFocus)
      window.document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
