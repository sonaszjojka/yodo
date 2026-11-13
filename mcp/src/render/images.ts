// Real pictures for render_drawing (ADR 0070). Core looks images up
// synchronously while it draws, so the images a render shows are read and
// decoded first, within limits that keep one call from exhausting the agent's
// process or returning a huge SVG. Every image that can't be shown is drawn as
// the export's placeholder and named, with a reason, in the result text.
import { loadImage } from '@napi-rs/canvas'
import type {
  ImageElement,
  YodoElement,
} from '../../../web/src/core/document/types.ts'
import type { SceneImage } from '../../../web/src/core/render/render.ts'
import type { HttpImageRepository } from '../../../web/src/storage/httpImages.ts'
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from '../../../web/src/storage/images.ts'
import { imageSize } from './imageSize.ts'

export interface ImageLimits {
  /** Decoded pixels one image may have. */
  imagePixels: number
  /** Decoded pixels one render may hold in total. */
  renderPixels: number
  /** Image bytes one SVG may embed, counted once per element that shows them. */
  svgBytes: number
}

export const IMAGE_LIMITS: ImageLimits = {
  imagePixels: 25_000_000,
  renderPixels: 50_000_000,
  svgBytes: 8 * 1024 * 1024,
}

/** One image's bytes, why it couldn't be read, or undefined when not stored. */
export type ImageRead =
  { bytes: Uint8Array; mimeType: string } | { error: string } | undefined

/** Reads one image of an open drawing; never throws for one image. */
export type ImageReader = (fileId: string) => Promise<ImageRead>

/** Where render_drawing gets image bytes: one per backend (ADR 0070). */
export interface ImageSource {
  /** Opens drawing `drawingId` to read its images one at a time, on demand. */
  open(drawingId: string): Promise<ImageReader>
}

/**
 * Images read ahead of the one being checked. Each read's bytes are dropped
 * once it is checked and decoded, so at most this many are held at a time,
 * however many images a drawing has.
 */
export const IMAGE_WINDOW = 4

/**
 * The self-hosted server's images, `GET /api/images/{hash}` through a
 * repository whose `fetch` carries the API token. Images are global by hash,
 * so the drawing id isn't needed.
 */
export function httpImageSource(repo: HttpImageRepository): ImageSource {
  return {
    async open() {
      return async (fileId) => {
        try {
          const blob = await repo.get(fileId)
          return (
            blob && {
              bytes: new Uint8Array(await blob.arrayBuffer()),
              mimeType: blob.type,
            }
          )
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
    },
  }
}

export type PlaceholderReason =
  | 'not loaded'
  | 'missing'
  | 'undecodable'
  | 'unsupported type'
  | 'too large'
  | 'too large to decode'
  | 'over the SVG size limit'
  | `read failed: ${string}`

/** An image element drawn as the placeholder, and why. */
export interface Placeholder {
  elementId: string
  fileId: string
  reason: PlaceholderReason
}

export interface SceneImages {
  /** The decoded picture for a PNG (renderExport's `images`). */
  lookup(fileId: string): SceneImage | undefined
  /** The `data:` URI for an SVG (buildSvg's `imageData`). */
  dataUri(fileId: string): string | undefined
  /** How many image elements the render has. */
  count: number
  /** The image elements drawn as placeholders, in element order. */
  placeholders: Placeholder[]
}

const RASTER_TYPES: readonly string[] = IMAGE_TYPES

/**
 * Reads and decodes the pictures of the image elements in `elements` (the
 * ones being rendered), each fileId once, in element order, so the limits
 * favour what is drawn first. Reads run at most IMAGE_WINDOW ahead, so the
 * limits bound what is held, not only what is kept. Without a source every
 * image is a placeholder.
 */
export async function loadSceneImages(
  elements: readonly YodoElement[],
  source: ImageSource | undefined,
  drawingId: string,
  format: 'png' | 'svg',
  limits: ImageLimits = IMAGE_LIMITS,
): Promise<SceneImages> {
  const images = elements.filter(
    (element): element is ImageElement => element.type === 'image',
  )
  const uses = new Map<string, number>()
  for (const image of images) {
    uses.set(image.fileId, (uses.get(image.fileId) ?? 0) + 1)
  }
  const failed = new Map<string, PlaceholderReason>()
  const decoded = new Map<string, SceneImage>()
  const uris = new Map<string, string>()

  if (!source) {
    for (const fileId of uses.keys()) failed.set(fileId, 'not loaded')
  } else if (uses.size > 0) {
    const read = await source.open(drawingId)
    const fileIds = [...uses.keys()]
    const pending = new Map<number, Promise<ImageRead>>()
    let started = 0
    let pixels = 0
    let svgBytes = 0
    for (const [index, fileId] of fileIds.entries()) {
      while (started < fileIds.length && started < index + IMAGE_WINDOW) {
        // A reader may still throw; that is one image's failure.
        pending.set(
          started,
          read(fileIds[started]!).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
        )
        started++
      }
      const bytesRead = await pending.get(index)!
      pending.delete(index)
      const count = uses.get(fileId)!
      const reason = await (async (): Promise<
        PlaceholderReason | undefined
      > => {
        if (!bytesRead) return 'missing'
        if ('error' in bytesRead) return `read failed: ${bytesRead.error}`
        const { bytes, mimeType } = bytesRead
        if (!RASTER_TYPES.includes(mimeType)) return 'unsupported type'
        if (bytes.byteLength > MAX_IMAGE_BYTES) return 'too large'
        const size = imageSize(bytes)
        if (!size) return 'undecodable'
        const area = size.width * size.height
        if (area > limits.imagePixels || pixels + area > limits.renderPixels) {
          return 'too large to decode'
        }
        // Every use embeds the bytes again.
        const embedded = bytes.byteLength * count
        if (format === 'svg' && svgBytes + embedded > limits.svgBytes) {
          return 'over the SVG size limit'
        }
        let picture: SceneImage
        try {
          picture = await loadImage(Buffer.from(bytes))
        } catch {
          return 'undecodable'
        }
        pixels += area
        if (format === 'svg') {
          svgBytes += embedded
          const base64 = Buffer.from(bytes).toString('base64')
          uris.set(fileId, `data:${mimeType};base64,${base64}`)
        } else {
          decoded.set(fileId, picture)
        }
        return undefined
      })()
      if (reason) failed.set(fileId, reason)
    }
  }

  return {
    lookup: (fileId) => decoded.get(fileId),
    dataUri: (fileId) => uris.get(fileId),
    count: images.length,
    placeholders: images.flatMap((image) => {
      const reason = failed.get(image.fileId)
      return reason
        ? [{ elementId: image.id, fileId: image.fileId, reason }]
        : []
    }),
  }
}
