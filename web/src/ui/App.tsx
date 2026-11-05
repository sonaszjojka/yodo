import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { ImageRepository } from '../storage/images.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import { Canvas } from './Canvas.tsx'
import { isExportShortcut } from './editShortcuts.ts'
import { ExportButton } from './ExportButton.tsx'
import { ExportDialog } from './ExportDialog.tsx'
import { HistoryControl } from './HistoryControl.tsx'
import type { ImageCache } from './imageCache.ts'
import { createImagePaster } from './imagePaster.ts'
import { createCanvasMeasure } from './measure.ts'
import { Notice } from './Notice.tsx'
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
  /** Where pasted images are stored (ADR 0040). */
  images: ImageRepository
  /** The decoded pictures, shared with Home's thumbnails. */
  imageCache: ImageCache
  /** The drawing to open, loaded before the first render. */
  document: YodoDocument
  /** Gets the last save (true if it succeeded) when the editor closes. */
  onClose?(saved: Promise<boolean>): void
}

// The editor on one drawing, auto-saved through the repository (ADR 0032).
// Leaving it (Back, or any route change) flushes the pending save.
export function App({
  repository,
  images,
  imageCache,
  document,
  onClose,
}: AppProps) {
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
  const [notice, setNotice] = useState<string>()
  const dismissNotice = useCallback(() => setNotice(undefined), [])

  // A pasted image: stored first, then added to the drawing (ADR 0040).
  const [paster] = useState(() =>
    createImagePaster(editor, images, imageCache, setNotice),
  )

  // Each opening gets a new number, used as the dialog's key: a dialog that
  // closes and opens again in one render batch still starts fresh and open.
  const [exportRun, setExportRun] = useState<number | null>(null)
  const exportRuns = useRef(0)
  const openExport = useCallback(() => {
    // Nothing to export from an empty drawing (the button is disabled too).
    if (editor.store.getState().document.elements.length > 0) {
      setExportRun((exportRuns.current += 1))
    }
  }, [editor])
  // A dialog's `close` event arrives a moment after it hides, so a late one
  // from a previous opening must not close the next.
  const closeExport = (run: number) =>
    setExportRun((current) => (current === run ? null : current))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Not while a dialog is open (it is the export dialog, or the shortcut
      // would reset its options). Focus may still sit on a control of a
      // dialog that just closed, so the target says nothing here.
      if (
        !isExportShortcut(event) ||
        window.document.querySelector('dialog[open]')
      ) {
        return
      }
      event.preventDefault()
      openExport()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openExport])

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
      // An upload still running must land in the drawing before the last save.
      onClose?.(paster.settled().then(() => finalSave(saver)))
    }
  }, [saver, paster, onClose])

  return (
    <>
      <Canvas editor={editor} imageCache={imageCache} onImage={paster.paste} />
      <Notice message={notice} onDismiss={dismissNotice} />
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
        <ExportButton editor={editor} onOpen={openExport} />
      </div>
      {exportRun !== null && (
        <ExportDialog
          key={exportRun}
          editor={editor}
          imageCache={imageCache}
          onClose={() => closeExport(exportRun)}
        />
      )}
      <Toolbar editor={editor} />
      <div className="bottom-bar">
        <HistoryControl editor={editor} />
        <ZoomControl editor={editor} />
        <SaveStatus status={saver.status} />
      </div>
    </>
  )
}
