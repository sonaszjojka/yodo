// The decoded pictures of image elements (ADR 0040), loaded from the
// ImageRepository on first use. The renderer asks for a picture synchronously
// and draws a placeholder until it arrives; the cache then tells its
// subscribers (the canvas, the thumbnails) to draw again.
import type { ImageRepository } from '../storage/images.ts'

export interface ImageCache {
  /** The picture for `fileId`, or undefined while it loads or if it is missing. Starts the load on first ask. */
  get(fileId: string): CanvasImageSource | undefined
  /** Calls `listener` whenever a picture arrives or a refresh is asked for. */
  subscribe(listener: () => void): () => void
  /**
   * Forgets that `fileId` was missing, so the next `get` loads it again. Call
   * it after storing an image, since an element may have been waiting for
   * exactly these bytes. A picture already loaded is kept.
   */
  refresh(fileId: string): void
}

type Entry = CanvasImageSource | 'loading' | 'missing'

export function createImageCache(
  images: ImageRepository,
  decode: (blob: Blob) => Promise<CanvasImageSource> = (blob) =>
    createImageBitmap(blob),
): ImageCache {
  const entries = new Map<string, Entry>()
  /** Hashes refreshed while their load was in flight: if that load finds nothing, it runs again. */
  const stale = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  async function load(fileId: string): Promise<void> {
    let result: Entry = 'missing'
    try {
      const blob = await images.get(fileId)
      if (blob) result = await decode(blob)
    } catch (error) {
      console.error('Could not load an image', error)
    }
    if (result === 'missing' && stale.delete(fileId)) return load(fileId)
    stale.delete(fileId)
    entries.set(fileId, result)
    // A missing picture changes nothing on screen, so nobody needs to redraw.
    if (result !== 'missing') notify()
  }

  return {
    get(fileId) {
      const entry = entries.get(fileId)
      if (entry === undefined) {
        entries.set(fileId, 'loading')
        void load(fileId)
        return undefined
      }
      return entry === 'loading' || entry === 'missing' ? undefined : entry
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    refresh(fileId) {
      if (entries.get(fileId) === 'loading') stale.add(fileId)
      if (entries.get(fileId) !== 'missing') return
      entries.delete(fileId)
      // Draws again, which asks `get` and so starts the new load.
      notify()
    },
  }
}
