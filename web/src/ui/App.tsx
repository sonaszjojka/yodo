import { useEffect, useState } from 'react'
import type { YodoDocument } from '../core/document/types.ts'
import { createEditor } from '../core/editor/editor.ts'
import { createStore } from '../core/store/store.ts'
import { createAutoSaver, finalSave } from '../storage/autosave.ts'
import {
  loadPanelLayout,
  loadStyleDefaults,
  savePanelLayout,
  saveStyleDefaults,
} from '../storage/preferences.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import { Canvas } from './Canvas.tsx'
import { HistoryControl } from './HistoryControl.tsx'
import { createCanvasMeasure } from './measure.ts'
import { SaveStatus } from './SaveStatus.tsx'
import { StyleBar } from './StyleBar.tsx'
import { StylePanel, StylePanelToggle } from './StylePanel.tsx'
import { TextEditor } from './TextEditor.tsx'
import { Toolbar } from './Toolbar.tsx'
import { TopBar } from './TopBar.tsx'
import { useTheme } from './useTheme.ts'
import { ZoomControl } from './ZoomControl.tsx'

export interface AppProps {
  /** Where drawings are stored, picked at startup (ADR 0031). */
  repository: DrawingRepository
  /** The drawing to open, loaded before the first render. */
  document: YodoDocument
  /** Gets the last save (true if it succeeded) when the editor closes. */
  onClose?(saved: Promise<boolean>): void
}

// The editor on one drawing, auto-saved through the repository (ADR 0032).
// Leaving it (Back, or any route change) flushes the pending save.
export function App({ repository, document, onClose }: AppProps) {
  // Lazy initialisers create these once, not on every render. Creating the
  // saver has no side effects; it starts watching in the effect below.
  const [editor] = useState(() =>
    createEditor(document, {
      measure: createCanvasMeasure(),
      defaults: loadStyleDefaults(),
    }),
  )
  const [saver] = useState(() => createAutoSaver(editor.store, repository))
  const [panel] = useState(() => createStore(loadPanelLayout()))
  const { theme } = useTheme()

  // Per-browser preferences (ADR 0036): stored whenever they change.
  useEffect(() => {
    let defaults = editor.store.getState().defaults
    const stopDefaults = editor.store.subscribe(() => {
      const next = editor.store.getState().defaults
      if (next === defaults) return
      defaults = next
      saveStyleDefaults(next)
    })
    const stopPanel = panel.subscribe(() => savePanelLayout(panel.getState()))
    return () => {
      stopDefaults()
      stopPanel()
    }
  }, [editor, panel])

  useEffect(() => {
    const stop = saver.start()
    // Save at once when the tab is hidden or closed, instead of waiting for
    // the debounce; best-effort on close (ADR 0032).
    const flush = () => void saver.flush()
    const onVisibility = () => {
      if (window.document.visibilityState === 'hidden') flush()
    }
    window.document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      window.document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      stop()
      onClose?.(finalSave(saver))
    }
  }, [saver, onClose])

  return (
    <>
      <Canvas editor={editor} />
      <TopBar editor={editor} />
      <TextEditor editor={editor} theme={theme} />
      <StyleBar
        editor={editor}
        onAllStyles={() =>
          panel.setState((prev) => (prev.open ? prev : { ...prev, open: true }))
        }
      />
      <StylePanel editor={editor} panel={panel} />
      <div className="top-right">
        <StylePanelToggle panel={panel} />
      </div>
      <Toolbar editor={editor} />
      <div className="bottom-bar">
        <HistoryControl editor={editor} />
        <ZoomControl editor={editor} />
        <SaveStatus status={saver.status} />
      </div>
    </>
  )
}
