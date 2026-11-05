import { describe, expect, test, vi } from 'vitest'
import { pngBlob } from '../storage/imageContract.ts'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import { createImageCache } from './imageCache.ts'

const picture = { tag: 'bitmap' } as unknown as CanvasImageSource
const decode = vi.fn(async () => picture)
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createImageCache', () => {
  test('is empty at first, then has the picture and tells subscribers', async () => {
    const repo = new InMemoryImageRepository()
    const id = await repo.put(pngBlob())
    const cache = createImageCache(repo, decode)
    const listener = vi.fn()
    cache.subscribe(listener)

    expect(cache.get(id)).toBeUndefined()
    await tick()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(cache.get(id)).toBe(picture)
  })

  test('loads each picture once', async () => {
    const repo = new InMemoryImageRepository()
    const id = await repo.put(pngBlob())
    const get = vi.spyOn(repo, 'get')
    const cache = createImageCache(repo, decode)

    cache.get(id)
    cache.get(id)
    await tick()
    cache.get(id)

    expect(get).toHaveBeenCalledTimes(1)
  })

  test('a missing blob is not asked for again on every draw', async () => {
    const repo = new InMemoryImageRepository()
    const get = vi.spyOn(repo, 'get')
    const cache = createImageCache(repo, decode)

    cache.get('0'.repeat(64))
    await tick()
    cache.get('0'.repeat(64))
    cache.get('0'.repeat(64))

    expect(get).toHaveBeenCalledTimes(1)
  })

  test('a blob stored after it was found missing shows once refreshed', async () => {
    const repo = new InMemoryImageRepository()
    const hash = await new InMemoryImageRepository().put(pngBlob())
    const cache = createImageCache(repo, decode)
    const redraw = vi.fn(() => cache.get(hash))
    cache.subscribe(redraw)

    cache.get(hash)
    await tick()
    expect(cache.get(hash)).toBeUndefined()

    await repo.put(pngBlob())
    cache.refresh(hash)
    await tick()

    expect(redraw).toHaveBeenCalled()
    expect(cache.get(hash)).toBe(picture)
  })

  test('a refresh while the load is in flight loads again if it found nothing', async () => {
    const repo = new InMemoryImageRepository()
    const hash = await new InMemoryImageRepository().put(pngBlob())
    const cache = createImageCache(repo, decode)
    cache.subscribe(() => cache.get(hash))

    cache.get(hash) // the load starts and will find nothing...
    await repo.put(pngBlob()) // ...the bytes are stored meanwhile...
    cache.refresh(hash) // ...and the paste says so before the load ends
    await tick()
    await tick()

    expect(cache.get(hash)).toBe(picture)
  })

  test('refresh keeps a picture that is already loaded', async () => {
    const repo = new InMemoryImageRepository()
    const id = await repo.put(pngBlob())
    const cache = createImageCache(repo, decode)
    cache.get(id)
    await tick()
    const get = vi.spyOn(repo, 'get')

    cache.refresh(id)
    await tick()

    expect(cache.get(id)).toBe(picture)
    expect(get).not.toHaveBeenCalled()
  })

  test('a blob that fails to decode counts as missing, without throwing', async () => {
    const repo = new InMemoryImageRepository()
    const id = await repo.put(pngBlob())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cache = createImageCache(repo, async () => {
      throw new Error('bad')
    })

    cache.get(id)
    await tick()

    expect(cache.get(id)).toBeUndefined()
  })
})
