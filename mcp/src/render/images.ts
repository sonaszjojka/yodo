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

/** Where render_drawing gets image bytes: one per backend (ADR 0070). */
export interface ImageSource {
  /** Each requested fileId's bytes in drawing `drawingId`; never throws for one image. */
  read(
    drawingId: string,
    fileIds: readonly string[],
  ): Promise<Map<string, ImageRead>>
}

/** Requests the HTTP source runs at a time. */
export const HTTP_IMAGE_CONCURRENCY = 4

/**
 * The self-hosted server's images, `GET /api/images/{hash}` through a
 * repository whose `fetch` carries the API token. Images are global by hash,
 * so the drawing id isn't needed.
 */
export function httpImageSource(repo: HttpImageRepository): ImageSource {
  return {
    async read(_drawingId, fileIds) {
      const result = new Map<string, ImageRead>()
      const queue = [...fileIds]
      async function worker() {
        for (let fileId = queue.shift(); fileId; fileId = queue.shift()) {
          try {
            const blob = await repo.get(fileId)
            result.set(
              fileId,
              blob && {
                bytes: new Uint8Array(await blob.arrayBuffer()),
                mimeType: blob.type,
              },
            )
          } catch (error) {
            result.set(fileId, {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(HTTP_IMAGE_CONCURRENCY, fileIds.length) },
          worker,
        ),
      )
      return result
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
 * favour what is drawn first. Without a source every image is a placeholder.
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
    const reads = await source.read(drawingId, [...uses.keys()])
    let pixels = 0
    let svgBytes = 0
    for (const [fileId, count] of uses) {
      const read = reads.get(fileId)
      const reason = await (async (): Promise<
        PlaceholderReason | undefined
      > => {
        if (!read) return 'missing'
        if ('error' in read) return `read failed: ${read.error}`
        const { bytes, mimeType } = read
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
