import rough from 'roughjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSvg } from '../core/export/svg/svgScene.ts'
import { fontFaceCss, neededFontFiles } from '../core/export/svg/fonts.ts'
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
  copyText,
  canvasToBlob,
  downloadBlob,
  type CopyResult,
  type DownloadHost,
} from './exportActions.ts'
import {
  EXPORT_TABS,
  fittingScale,
  initialChoices,
  neighbourFormat,
  pngFileName,
  SCALES,
  svgFileName,
  type ExportChoices,
} from './exportChoices.ts'
import type { ImageCache } from './imageCache.ts'
import { createCanvasMeasure } from './measure.ts'
import { imageDataUris } from './svgImages.ts'
import { loadEmbeddedFonts, pageFontsReady } from './svgFonts.ts'
import type { ImageRepository } from '../storage/images.ts'
import { useStore } from './useStore.ts'
import { exportDrawing, exportErrorMessage } from './yodoFile.ts'

const selectDocument = (state: EditorState) => state.document
const selectSelected = (state: EditorState) => state.selectedIds

const COPY_MESSAGES: Record<CopyResult, string> = {
  copied: 'Copied to the clipboard.',
  unsupported: 'This browser cannot copy images. Use Download.',
  failed: 'Could not copy the image. Use Download.',
}

const SVG_COPY_MESSAGES: Record<CopyResult, string> = {
  copied: 'Copied the SVG code to the clipboard.',
  unsupported: 'This browser cannot copy text. Use Download.',
  failed: 'Could not copy the SVG code. Use Download.',
}

const downloadHost: DownloadHost = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createLink: () => window.document.createElement('a'),
}

const FONT_NOTE =
  'The fonts could not be embedded, so text uses whatever fonts the viewer has.'

/** The SVG tab's result for one `svgJob`: the file, and a blob URL for the preview. */
interface SvgResult {
  job: object
  text: string
  url: string
}

/**
 * The export dialog (docs/ui.md, Export dialog) with a PNG, an SVG and a Yodo
 * file tab (ADR 0056).
 * Mounted only while open, so its options start fresh each time. PNG draws one
 * canvas with `renderExport` (ADR 0041); SVG builds the file with `buildSvg`
 * (ADR 0043). Either way the preview is the thing Copy and Download give you.
 */
export function ExportDialog({
  editor,
  imageCache,
  images,
  onClose,
}: {
  editor: Editor
  imageCache: ImageCache
  images: ImageRepository
  onClose(): void
}) {
  const document_ = useStore(editor.store, selectDocument)
  const selectedIds = useStore(editor.store, selectSelected)
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [choices, setChoices] = useState<ExportChoices>(() =>
    initialChoices(
      document_.name,
      selectedIds.length,
      document_.elements.length === 0,
    ),
  )
  const [status, setStatus] = useState('')
  const measure = useMemo(() => createCanvasMeasure(), [])

  const elements = useMemo(
    () => exportElements(document_.elements, selectedIds, choices.scope),
    [document_.elements, selectedIds, choices.scope],
  )
  // The canvas measure wraps labels and sizes the frame with the page's fonts,
  // which may still be loading when the dialog opens. Once they are, the epoch
  // changes and the frame (and so the layout) is worked out again.
  const [fontsEpoch, setFontsEpoch] = useState(0)
  useEffect(() => {
    let cancelled = false
    void pageFontsReady(elements, window.document.fonts).then(() => {
      if (!cancelled) setFontsEpoch((epoch) => epoch + 1)
    })
    return () => {
      cancelled = true
    }
  }, [elements])
  const frame = useMemo(() => {
    void fontsEpoch // only here to re-run the measuring when the fonts arrive
    return exportFrame(elements, measure)
  }, [elements, measure, fontsEpoch])
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
      choices.format === 'png' && frame && scale
        ? {
            elements,
            frame,
            scale,
            dark: choices.dark,
            bg: choices.background,
            pictures,
          }
        : null,
    [
      elements,
      frame,
      scale,
      choices.format,
      choices.dark,
      choices.background,
      pictures,
    ],
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

  // The SVG tab: build the file once the fonts and pictures it embeds are in.
  // A new object whenever an input changes, like `job` above.
  const svgJob = useMemo(
    () =>
      choices.format === 'svg' && frame
        ? {
            elements,
            frame,
            dark: choices.dark,
            bg: choices.background,
          }
        : null,
    [elements, frame, choices.format, choices.dark, choices.background],
  )
  const [svg, setSvg] = useState<SvgResult | null>(null)
  const svgUrl = useRef<string | null>(null)
  useEffect(() => {
    if (!svgJob) return
    let cancelled = false
    void (async () => {
      let fontCss = ''
      let note = ''
      try {
        fontCss = fontFaceCss(
          await loadEmbeddedFonts(neededFontFiles(svgJob.elements)),
        )
      } catch (error) {
        console.error('Could not load the fonts for the SVG', error)
        note = FONT_NOTE
      }
      const pictures = await imageDataUris(svgJob.elements, images)
      const text = buildSvg(
        svgJob.elements,
        svgJob.frame,
        { theme: svgJob.dark ? 'dark' : 'light', background: svgJob.bg },
        {
          measure,
          generator: rough.generator(),
          fontCss,
          imageData: (fileId) => pictures.get(fileId),
        },
      )
      if (cancelled) return
      const url = URL.createObjectURL(
        new Blob([text], { type: 'image/svg+xml' }),
      )
      if (svgUrl.current) URL.revokeObjectURL(svgUrl.current)
      svgUrl.current = url
      setSvg({ job: svgJob, text, url })
      if (note) setStatus(note)
    })()
    return () => {
      cancelled = true
    }
  }, [svgJob, images, measure])
  useEffect(
    () => () => {
      if (svgUrl.current) URL.revokeObjectURL(svgUrl.current)
    },
    [],
  )
  const svgReady = svgJob !== null && svg?.job === svgJob

  const update = (patch: Partial<ExportChoices>) => {
    setStatus('')
    setChoices((prev) => ({ ...prev, ...patch }))
  }
  const isSvg = choices.format === 'svg'
  const isYodo = choices.format === 'yodo'
  const size = isYodo
    ? undefined
    : isSvg
      ? frame && {
          width: Math.ceil(frame.width),
          height: Math.ceil(frame.height),
        }
      : frame && scale
        ? exportSize(frame, scale)
        : undefined
  const ready = isYodo || (isSvg ? svgReady : job !== null && drawn === job)

  function download() {
    if (isYodo) {
      // Like auto-save: the document plus the view as it is now.
      const { document, viewport } = editor.store.getState()
      exportDrawing(
        { ...document, appState: { ...document.appState, viewport } },
        images,
        undefined,
        choices.fileName,
      ).catch((error: unknown) => {
        console.error('Could not export the drawing', error)
        setStatus(exportErrorMessage(error))
      })
      return
    }
    if (isSvg) {
      downloadBlob(
        new Blob([svg!.text], { type: 'image/svg+xml' }),
        svgFileName(choices.fileName),
        downloadHost,
      )
      return
    }
    canvasToBlob(canvas.current!).then(
      (blob) => downloadBlob(blob, pngFileName(choices.fileName), downloadHost),
      () => setStatus('Could not create the image.'),
    )
  }

  async function copy() {
    if (isSvg) {
      setStatus(
        SVG_COPY_MESSAGES[await copyText(svg!.text, navigator.clipboard)],
      )
      return
    }
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
      <h2 id="export-title">Export</h2>
      <div className="export-tabs" role="tablist" aria-label="Format">
        {EXPORT_TABS.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            role="tab"
            aria-selected={choices.format === format}
            tabIndex={choices.format === format ? 0 : -1}
            onClick={() => update({ format })}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                return
              event.preventDefault()
              const next = neighbourFormat(format, event.key)
              update({ format: next })
              // Focus follows the selected tab (WAI-ARIA tabs pattern).
              event.currentTarget
                .parentElement!.querySelectorAll<HTMLElement>('[role="tab"]')
                [EXPORT_TABS.findIndex((tab) => tab.format === next)]?.focus()
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {isYodo && (
        <p className="export-note">
          The whole drawing with its images, as a .yodo file you can open in
          Yodo.
        </p>
      )}
      <div
        className="export-preview"
        data-transparent={!choices.background}
        // Not `hidden`: the class sets `display`, which would win over it.
        style={isYodo ? { display: 'none' } : undefined}
      >
        {/* The canvas stays mounted while another tab is open, so coming back is instant. */}
        {frame && scale ? (
          <canvas
            ref={canvas}
            hidden={isSvg || isYodo}
            aria-label="Preview of the exported image"
          />
        ) : null}
        {isSvg && frame && svg && (
          <img src={svg.url} alt="Preview of the exported SVG" />
        )}
        {isSvg && frame && !svgReady && !svg && (
          <p role="status">Preparing the SVG…</p>
        )}
        {!frame && !isYodo && <p role="status">Nothing to export.</p>}
        {!isSvg && frame && !scale && (
          <p role="status">This is too large to export as an image.</p>
        )}
      </div>
      {size && (
        <p className="export-size">
          {size.width} × {size.height} px
        </p>
      )}

      {!isYodo && (
        <>
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
        </>
      )}

      {!isSvg && !isYodo && (
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
      )}

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
        {!isYodo && (
          <button
            type="button"
            className="button"
            disabled={!ready}
            onClick={() => void copy()}
          >
            Copy
          </button>
        )}
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
