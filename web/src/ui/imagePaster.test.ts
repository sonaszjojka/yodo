import { describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { createAutoSaver, finalSave } from '../storage/autosave.ts'
import { pngBlob } from '../storage/imageContract.ts'
import { ImageError } from '../storage/images.ts'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import { InMemoryDrawingRepository } from '../storage/memory.ts'
import { createImageCache } from './imageCache.ts'
import { createImagePaster } from './imagePaster.ts'

const view = { x: 0, y: 0, width: 1000, height: 800 }
const file = new File([pngBlob()], 'shot.png', { type: 'image/png' })

/** An image store whose uploads finish when the test says so. */
function slowImages() {
  const inner = new InMemoryImageRepository()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  return {
    images: {
      put: async (blob: Blob) => {
        await gate
        return inner.put(blob)
      },
      get: (hash: string) => inner.get(hash),
      has: (hash: string) => inner.has(hash),
    },
    release,
  }
}

describe('createImagePaster', () => {
  test('a close while an upload is running still saves the image', async () => {
    // Pasted, then the editor closes (Back to Home) before the upload ends.
    const drawings = new InMemoryDrawingRepository()
    const editor = createEditor(createDocument())
    const saver = createAutoSaver(editor.store, drawings)
    const { images, release } = slowImages()
    const paster = createImagePaster(
      editor,
      images,
      createImageCache(images),
      () => {},
    )
    // The decoder is missing in Node, so stand in for it.
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 30,
      height: 20,
      close() {},
    }))

    paster.paste(file, view)
    const closing = paster.settled().then(() => finalSave(saver))
    release()
    await closing

    const stored = await drawings.get(editor.store.getState().document.id)
    expect(stored?.elements.map((e) => e.type)).toEqual(['image'])
    expect(stored?.fileIds).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  test('a refused file reports its message and adds nothing', async () => {
    const editor = createEditor(createDocument())
    const onError = vi.fn()
    const images = new InMemoryImageRepository()
    const paster = createImagePaster(
      editor,
      images,
      createImageCache(images),
      onError,
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    paster.paste(new File(['x'], 'a.svg', { type: 'image/svg+xml' }), view)
    await paster.settled()

    expect(onError).toHaveBeenCalledWith(
      new ImageError('Only PNG, JPEG, GIF and WebP images can be added.')
        .message,
    )
    expect(editor.store.getState().document.elements).toEqual([])
  })
})
