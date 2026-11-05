// Adds pasted image files to the drawing (ADR 0040): stores each one, then
// places it. Kept outside React so a closing editor can wait for uploads that
// are still running.
import type { Editor } from '../core/editor/editor.ts'
import type { Bounds } from '../core/geometry/rect.ts'
import {
  ImageError,
  ingestImage,
  type ImageRepository,
} from '../storage/images.ts'
import type { ImageCache } from './imageCache.ts'

export interface ImagePaster {
  /** Stores `file` and adds it to the drawing centred on `view`; failures go to `onError`. */
  paste(file: File, view: Bounds): void
  /** Resolves once every paste started so far has finished, so the final save includes it. */
  settled(): Promise<void>
}

export function createImagePaster(
  editor: Editor,
  images: ImageRepository,
  imageCache: ImageCache,
  onError: (message: string) => void,
): ImagePaster {
  const pending = new Set<Promise<void>>()
  return {
    paste(file, view) {
      const task = ingestImage(file, images)
        .then((stored) => {
          // An element may have been waiting for exactly these bytes.
          imageCache.refresh(stored.fileId)
          editor.addImage(stored, view)
        })
        .catch((error: unknown) => {
          console.error('Could not add the image', error)
          onError(
            error instanceof ImageError
              ? error.message
              : 'Couldn’t save the image. Try again.',
          )
        })
        .finally(() => void pending.delete(task))
      pending.add(task)
    },
    async settled() {
      await Promise.all(pending)
    },
  }
}
