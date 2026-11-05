import { describe, expect, test, vi } from 'vitest'
import { createImage, createShape } from '../core/document/create.ts'
import { imageDataUris } from './svgImages.ts'

const view = { x: 0, y: 0, width: 100, height: 100 }
const size = { width: 10, height: 10 }

describe('imageDataUris', () => {
  test('reads each image once and encodes it with its type', async () => {
    const get = vi.fn(async () => new Blob(['abc'], { type: 'image/png' }))
    const a = createImage('aa', size, view)
    const uris = await imageDataUris(
      [a, { ...a, id: 'copy' }, createShape('ellipse', view)],
      { get },
    )
    expect(get).toHaveBeenCalledTimes(1)
    expect(uris.get('aa')).toBe('data:image/png;base64,YWJj')
  })

  test('leaves out images that are missing or fail to read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const get = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('x')
      return undefined
    })
    const uris = await imageDataUris(
      [createImage('gone', size, view), createImage('bad', size, view)],
      { get },
    )
    expect(uris.size).toBe(0)
  })
})
