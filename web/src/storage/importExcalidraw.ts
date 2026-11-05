// Imports an Excalidraw file as a new drawing (ADR 0014): converts it, stores
// its images by content hash (ADR 0040), then saves the drawing last so a
// failure never leaves a drawing that points at missing images.
import {
  convertExcalidraw,
  ExcalidrawImportError,
  type ImportSummary,
} from '../core/excalidraw/convert.ts'
import type { Measure } from '../core/text/layout.ts'
import {
  ImageError,
  ingestImage,
  type ImageRepository,
  type IngestOptions,
} from './images.ts'
import type { DrawingRepository } from './repository.ts'

export interface ImportDeps {
  drawings: DrawingRepository
  images: ImageRepository
  measure: Measure
  /** Reads an image's size; defaults to the browser's decoder. */
  decode?: IngestOptions['decode']
}

export interface ImportResult {
  /** The new drawing's id. */
  id: string
  summary: ImportSummary
}

/** Files larger than this are refused before they are read. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024

/** The bytes of a `data:` URL, or undefined for anything else. */
function blobFromDataUrl(dataUrl: string): Blob | undefined {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return undefined
  const [, type, base64, payload] = match
  try {
    const binary = base64 ? atob(payload!) : decodeURIComponent(payload!)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new Blob([bytes], { type })
  } catch {
    return undefined
  }
}

/**
 * Creates a drawing from the text of an `.excalidraw` file. Throws
 * `ExcalidrawImportError` for a file that is not Excalidraw JSON. A storage
 * failure rejects with that error and saves no drawing.
 */
export async function importExcalidrawFile(
  text: string,
  { drawings, images, measure, decode }: ImportDeps,
): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ExcalidrawImportError('This file is not valid JSON.')
  }
  const { document, summary } = await convertExcalidraw(parsed, {
    measure,
    async resolveImage(_sourceId, dataUrl) {
      const blob = blobFromDataUrl(dataUrl)
      if (!blob) return undefined
      try {
        return await ingestImage(blob, images, { decode })
      } catch (error) {
        // An unusable picture is dropped; a failing store aborts the import.
        if (error instanceof ImageError) return undefined
        throw error
      }
    },
  })
  await drawings.save(document)
  return { id: document.id, summary }
}
