import { useCallback, useEffect, useRef, useState } from 'react'
import type { YodoDocument } from '../core/document/types.ts'
import { createEditor } from '../core/editor/editor.ts'
import { createStore } from '../core/store/store.ts'
import { createAutoSaver, finalSave } from '../storage/autosave.ts'
import type { LoadedDrawing } from '../storage/drawings.ts'
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
import { isEditable } from './editShortcuts.ts'
import { ShortcutsButton, ShortcutsDialog } from './ShortcutsDialog.tsx'
import { StyleBar } from './StyleBar.tsx'
import { StylePanel, StylePanelToggle } from './StylePanel.tsx'
import { TextEditor } from './TextEditor.tsx'
import { Toolbar } from './Toolbar.tsx'
import { TopBar } from './TopBar.tsx'
import { useConcurrentEdits, type EditorNotice } from './useConcurrentEdits.ts'
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
  /** The stored revision of `document`; every save expects it (ADR 0062). */
  revision: number
  /** Shown when the editor opens, e.g. after a reload from elsewhere. */
  initialNotice?: EditorNotice
  /**
   * Replaces this editor with one on the stored version, after a conflict or
   * a newer version found on focus (ADR 0062).
   */
  onReload?(loaded: LoadedDrawing, notice: EditorNotice): void
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
  revision,
  initialNotice,
  onReload,
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
  const [saver] = useState(() =>
    createAutoSaver(editor.store, repository, { revision }),
  )
  const [panel] = useState(() => createStore(loadPanelLayout()))
  const { theme } = useTheme()
  const [notice, setNotice] = useState<EditorNotice | undefined>(initialNotice)
  const dismissNotice = useCallback(() => setNotice(undefined), [])
  const showError = useCallback((message: string) => setNotice({ message }), [])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openShortcuts = useCallback(() => {
    // A key held down now would never see its keyup (the dialog takes focus).
    editor.setSpaceHeld(false)
    editor.setShift(false)
    setShortcutsOpen(true)
  }, [editor])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])

  // `?` opens the shortcuts list, or closes it when focus is not in the search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (isEditable(event.target)) return
      // Never stack the list on another dialog (export); it may close itself.
      if (!shortcutsOpen && window.document.querySelector('dialog[open]'))
        return
      event.preventDefault()
      if (shortcutsOpen) closeShortcuts()
      else openShortcuts()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsOpen, openShortcuts, closeShortcuts])

  // A pasted image: stored first, then added to the drawing (ADR 0040).
  const [paster] = useState(() =>
    createImagePaster(editor, images, imageCache, showError),
  )
  useConcurrentEdits({
    repository,
    id: document.id,
    saver,
    settled: () => paster.settled(),
    // Text being typed is not in the document until it is committed.
    busy: () => editor.store.getState().editing !== null,
    onReload,
    showNotice: setNotice,
  })

  // Each opening gets a new number, used as the dialog's key: a dialog that
  // closes and opens again in one render batch still starts fresh and open.
  const [exportRun, setExportRun] = useState<number | null>(null)
  const exportRuns = useRef(0)
  const openExport = useCallback(() => {
    setExportRun((exportRuns.current += 1))
  }, [])
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
      <Notice
        message={notice?.message}
        tone={notice?.tone}
        action={notice?.action}
        onDismiss={dismissNotice}
      />
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
        <ExportButton onOpen={openExport} />
        <StylePanelToggle panel={panel} />
      </div>
      {exportRun !== null && (
        <ExportDialog
          key={exportRun}
          editor={editor}
          imageCache={imageCache}
          images={images}
          onClose={() => closeExport(exportRun)}
        />
      )}
      <Toolbar editor={editor} />
      <div className="bottom-bar">
        <HistoryControl editor={editor} />
        <ZoomControl editor={editor} />
        <SaveStatus status={saver.status} />
        <ShortcutsButton onClick={openShortcuts} />
      </div>
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
    </>
  )
}
