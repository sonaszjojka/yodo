import { describe, expect, test, vi } from 'vitest'
import { copyPng, downloadBlob } from './exportActions.ts'

const blob = new Blob(['x'], { type: 'image/png' })

describe('copyPng', () => {
  test('writes one image/png item and reports success', async () => {
    const write = vi.fn(async () => {})
    const makeItem = vi.fn((data: Record<string, Promise<Blob>>) => ({ data }))

    const result = await copyPng(Promise.resolve(blob), { write }, makeItem)

    expect(result).toBe('copied')
    expect(Object.keys(makeItem.mock.calls[0][0])).toEqual(['image/png'])
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('reports an unsupported browser without a clipboard or ClipboardItem', async () => {
    const item = () => ({})
    expect(await copyPng(Promise.resolve(blob), undefined, item)).toBe(
      'unsupported',
    )
    expect(
      await copyPng(Promise.resolve(blob), { write: vi.fn() }, undefined),
    ).toBe('unsupported')
  })

  test('reports a rejected write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const write = vi.fn(async () => {
      throw new Error('denied')
    })
    expect(await copyPng(Promise.resolve(blob), { write }, () => ({}))).toBe(
      'failed',
    )
  })
})

describe('downloadBlob', () => {
  test('clicks a link to the blob with the file name, then frees the URL', () => {
    const events: string[] = []
    const link = {
      href: '',
      download: '',
      click: () => events.push(`click ${link.href} ${link.download}`),
    }

    downloadBlob(blob, 'Sketch.png', {
      createObjectURL: () => 'blob:1',
      revokeObjectURL: (url) => events.push(`revoke ${url}`),
      createLink: () => link,
    })

    expect(events).toEqual(['click blob:1 Sketch.png', 'revoke blob:1'])
  })
})
