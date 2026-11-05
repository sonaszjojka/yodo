// The pictures an SVG export embeds as `data:` URIs (ADR 0043). The canvas
// export draws decoded bitmaps from the image cache; an SVG needs the stored
// bytes, so they come from the ImageRepository instead.
import type { YodoElement } from '../core/document/types.ts'
import { blobToBase64 } from '../storage/base64.ts'
import type { ImageRepository } from '../storage/images.ts'

/** fileId -> data URI for each image element; a missing or unreadable file is left out. */
export async function imageDataUris(
  elements: readonly YodoElement[],
  images: Pick<ImageRepository, 'get'>,
): Promise<Map<string, string>> {
  const fileIds = [
    ...new Set(
      elements.flatMap((element) =>
        element.type === 'image' ? [element.fileId] : [],
      ),
    ),
  ]
  const uris = new Map<string, string>()
  await Promise.all(
    fileIds.map(async (fileId) => {
      try {
        const blob = await images.get(fileId)
        if (!blob) return
        uris.set(
          fileId,
          `data:${blob.type || 'application/octet-stream'};base64,${await blobToBase64(blob)}`,
        )
      } catch (error) {
        console.error('Could not read an image for the export', error)
      }
    }),
  )
  return uris
}
