import { inflateRawSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../web/src/core/document/create.ts'
import {
  parseYodoFile,
  serializeYodoFile,
} from '../../web/src/core/document/file.ts'
import { decodeOpenLinkData } from '../../web/src/core/document/openLink.ts'
import { openLinkFor, type OpenLinks } from './openLinks.ts'

const appUrl = new URL('https://draw.example.com/yodo/')

function exporting(result: Awaited<ReturnType<OpenLinks['exportFile']>>) {
  return { appUrl, exportFile: async () => result } satisfies OpenLinks
}

const doc = {
  ...createDocument('Login flow'),
  elements: [createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })],
}

function dataOf(url: string): string {
  return url.slice(`${appUrl.href}#/open/`.length)
}

describe('openLinkFor', () => {
  test('gives the file and a link that opens the same drawing', async () => {
    const text = serializeYodoFile(doc, {})
    const result = await openLinkFor(
      exporting({ path: '/home/ada/Yodo/x.yodo', text }),
      doc.id,
      1,
    )
    expect(result.file).toBe('/home/ada/Yodo/x.yodo')
    expect(result.openUrl).toMatch(
      /^https:\/\/draw\.example\.com\/yodo\/#\/open\/[\w-]+$/,
    )
    expect(result.text).toContain('File: /home/ada/Yodo/x.yodo')
    expect(result.text).toContain(`Open in Yodo: ${result.openUrl}`)

    const data = dataOf(result.openUrl!)
    expect(parseYodoFile(await decodeOpenLinkData(data)).document).toEqual(doc)
    // Plain raw deflate: any zlib reads it, not only Web Streams (ADR 0069).
    const raw = inflateRawSync(Buffer.from(data, 'base64url')).toString('utf8')
    expect(raw).toBe(text)
  })

  test('gives only the file above the link limit', async () => {
    // Random-ish text barely compresses, so it passes the limit quickly.
    const noise = Array.from({ length: 40_000 }, (_, i) =>
      ((i * 2654435761) >>> 0).toString(36),
    ).join('')
    const big = serializeYodoFile({ ...doc, name: noise }, {})
    const result = await openLinkFor(
      exporting({ path: '/p.yodo', text: big }),
      doc.id,
      1,
    )
    expect(result).toEqual({
      file: '/p.yodo',
      text: expect.stringContaining(
        'too large for a link (over 16384 characters)',
      ),
    })
  })

  test('gives no link when the drawing changed after the write', async () => {
    const result = await openLinkFor(
      exporting({ path: '/p.yodo', changed: true }),
      doc.id,
      1,
    )
    expect(result.openUrl).toBeUndefined()
    expect(result.file).toBe('/p.yodo')
    expect(result.text).toContain('changed after this write')
  })

  test('never throws: a read error or a missing drawing is just noted', async () => {
    const failing: OpenLinks = {
      appUrl,
      exportFile: () => Promise.reject(new Error('EACCES')),
    }
    expect(await openLinkFor(failing, doc.id, 1)).toEqual({
      text: expect.stringContaining('EACCES'),
    })
    expect(
      (await openLinkFor(exporting(undefined), doc.id, 1)).openUrl,
    ).toBeUndefined()
  })
})
