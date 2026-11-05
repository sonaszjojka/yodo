import rough from 'roughjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  exportElements,
  exportFrame,
  exportSize,
  renderExport,
  scaleFits,
} from '../core/export/exportScene.ts'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import {
  copyPng,
  canvasToBlob,
  downloadBlob,
  type CopyResult,
} from './exportActions.ts'
import {
  fittingScale,
  initialChoices,
  pngFileName,
  SCALES,
  type ExportChoices,
} from './exportChoices.ts'
import type { ImageCache } from './imageCache.ts'
import { createCanvasMeasure } from './measure.ts'
import { useStore } from './useStore.ts'

const selectDocument = (state: EditorState) => state.document
const selectSelected = (state: EditorState) => state.selectedIds

const COPY_MESSAGES: Record<CopyResult, string> = {
  copied: 'Copied to the clipboard.',
  unsupported: 'This browser cannot copy images. Use Download.',
  failed: 'Could not copy the image. Use Download.',
}

/**
 * The export dialog (docs/ui.md, Export dialog): PNG only for now. Mounted
 * only while open, so its options start fresh each time. It draws one canvas
 * with `renderExport` (ADR 0041) and shows that canvas as the preview, so
 * what you see is exactly what Copy and Download give you.
 */
export function ExportDialog({
  editor,
  imageCache,
  onClose,
}: {
  editor: Editor
  imageCache: ImageCache
  onClose(): void
}) {
  const document_ = useStore(editor.store, selectDocument)
  const selectedIds = useStore(editor.store, selectSelected)
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [choices, setChoices] = useState<ExportChoices>(() =>
    initialChoices(document_.name, selectedIds.length),
  )
  const [status, setStatus] = useState('')
  const measure = useMemo(() => createCanvasMeasure(), [])

  const elements = useMemo(
    () => exportElements(document_.elements, selectedIds, choices.scope),
    [document_.elements, selectedIds, choices.scope],
  )
  const frame = useMemo(
    () => exportFrame(elements, measure),
    [elements, measure],
  )
  const scale = frame && fittingScale(frame, choices.scale)

  useEffect(() => {
    const element = dialog.current!
    // No cleanup that closes it: unmounting removes the dialog, and in
    // development StrictMode runs the cleanup right after mounting, whose
    // `close` event would unmount the dialog again at once.
    if (!element.open) element.showModal()
  }, [])

  // What the canvas should show. A new object whenever any input changes, so
  // `drawn === job` says the canvas holds exactly this (Copy and Download are
  // enabled only then; before the first draw the canvas is a blank default).
  // Pictures arrive from the image cache while the dialog is open (ADR 0040);
  // each arrival makes a new job, so the canvas is drawn again with them.
  const [pictures, setPictures] = useState(0)
  useEffect(
    () => imageCache.subscribe(() => setPictures((count) => count + 1)),
    [imageCache],
  )
  const job = useMemo(
    () =>
      frame && scale
        ? {
            elements,
            frame,
            scale,
            dark: choices.dark,
            bg: choices.background,
            pictures,
          }
        : null,
    [elements, frame, scale, choices.dark, choices.background, pictures],
  )
  const [drawn, setDrawn] = useState<typeof job>(null)

  // Draw once the fonts are ready, so text has the shape it has on screen.
  useEffect(() => {
    if (!job) return
    let cancelled = false
    void window.document.fonts.ready.then(() => {
      if (cancelled) return
      const target = canvas.current!
      renderExport(target, rough.canvas(target), job.elements, job.frame, {
        scale: job.scale,
        theme: job.dark ? 'dark' : 'light',
        background: job.bg,
        images: imageCache.get,
      })
      setDrawn(job)
    })
    return () => {
      cancelled = true
    }
  }, [job, imageCache])

  const update = (patch: Partial<ExportChoices>) => {
    setStatus('')
    setChoices((prev) => ({ ...prev, ...patch }))
  }
  const size = frame && scale ? exportSize(frame, scale) : undefined
  const ready = job !== null && drawn === job

  function download() {
    canvasToBlob(canvas.current!).then(
      (blob) =>
        downloadBlob(blob, pngFileName(choices.fileName), {
          createObjectURL: (b) => URL.createObjectURL(b),
          revokeObjectURL: (url) => URL.revokeObjectURL(url),
          createLink: () => window.document.createElement('a'),
        }),
      () => setStatus('Could not create the image.'),
    )
  }

  async function copy() {
    const blob = canvasToBlob(canvas.current!)
    const Item = (window as { ClipboardItem?: typeof ClipboardItem })
      .ClipboardItem
    const result = await copyPng(
      blob,
      navigator.clipboard,
      Item && ((data) => new Item(data)),
    )
    setStatus(COPY_MESSAGES[result])
  }

  const selectionCount = selectedIds.length

  return (
    <dialog
      ref={dialog}
      className="export-dialog"
      aria-labelledby="export-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <h2 id="export-title">Export image</h2>
      <div className="export-preview" data-transparent={!choices.background}>
        {frame && scale ? (
          <canvas ref={canvas} aria-label="Preview of the exported image" />
        ) : (
          <p role="status">
            {frame
              ? 'This is too large to export as an image.'
              : 'Nothing to export.'}
          </p>
        )}
      </div>
      {size && (
        <p className="export-size">
          {size.width} × {size.height} px
        </p>
      )}

      <fieldset>
        <legend>What to export</legend>
        <label>
          <input
            type="radio"
            name="export-scope"
            checked={choices.scope === 'all'}
            onChange={() => update({ scope: 'all' })}
          />
          Whole drawing
        </label>
        <label>
          <input
            type="radio"
            name="export-scope"
            checked={choices.scope === 'selection'}
            disabled={selectionCount === 0}
            onChange={() => update({ scope: 'selection' })}
          />
          Selection{selectionCount > 0 ? ` (${selectionCount})` : ''}
        </label>
      </fieldset>

      <label>
        <input
          type="checkbox"
          checked={choices.background}
          onChange={(event) => update({ background: event.target.checked })}
        />
        Background
      </label>
      <label>
        <input
          type="checkbox"
          checked={choices.dark}
          onChange={(event) => update({ dark: event.target.checked })}
        />
        Dark version
      </label>

      <fieldset>
        <legend>Scale</legend>
        {SCALES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="export-scale"
              checked={scale === option}
              disabled={!frame || !scaleFits(frame, option)}
              onChange={() => update({ scale: option })}
            />
            {option}x
          </label>
        ))}
      </fieldset>

      <label className="export-name">
        File name
        <input
          type="text"
          value={choices.fileName}
          onChange={(event) => update({ fileName: event.target.value })}
        />
      </label>

      <p className="export-status" role="status">
        {status}
      </p>
      <div className="export-actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="button"
          disabled={!ready}
          onClick={() => void copy()}
        >
          Copy
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={!ready}
          onClick={download}
        >
          Download
        </button>
      </div>
    </dialog>
  )
}
