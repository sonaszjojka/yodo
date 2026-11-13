import { describe, expect, test } from 'vitest'
import v1Export from './fixtures/v1-export.yodo?raw'
import {
  decodeOpenLinkData,
  encodeOpenLinkData,
  MAX_OPEN_LINK_DATA,
  OpenLinkError,
  openLinkUrl,
} from './openLink.ts'

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** `bytes` raw-deflated, as base64url: link data for any bytes, not only text. */
async function rawData(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  return base64url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

async function errorCode(data: string, maxBytes?: number) {
  try {
    await decodeOpenLinkData(data, maxBytes)
  } catch (error) {
    if (error instanceof OpenLinkError) return error.code
    throw error
  }
  return undefined
}

describe('open link data', () => {
  test.each([
    ['ASCII', '{"name":"plain"}'],
    ['emoji and Polish text', '{"name":"Zażółć gęślą jaźń 🎨✏️"}'],
    ['an export with an image', v1Export],
  ])('round trips %s', async (_, text) => {
    const data = await encodeOpenLinkData(text)
    expect(await decodeOpenLinkData(data)).toBe(text)
  })

  test('uses only base64url characters, without padding', async () => {
    const data = await encodeOpenLinkData(v1Export.repeat(3))
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('data over the length limit is too long', async () => {
    expect(await errorCode('A'.repeat(MAX_OPEN_LINK_DATA + 1))).toBe('too-long')
  })

  test.each([
    ['empty data', ''],
    ['a character outside base64url', 'abc+def'],
    ['padding', 'q1YqLkksSVGyAgA='],
    ['an impossible length', 'abcde'],
    [
      'bytes that aren’t deflate',
      base64url(new TextEncoder().encode('not deflate at all')),
    ],
  ])('%s is malformed', async (_, data) => {
    expect(await errorCode(data)).toBe('malformed')
  })

  test('a truncated stream is malformed', async () => {
    const data = await encodeOpenLinkData(v1Export)
    expect(await errorCode(data.slice(0, Math.floor(data.length / 2)))).toBe(
      'malformed',
    )
  })

  test('bytes that aren’t UTF-8 are malformed', async () => {
    expect(
      await errorCode(await rawData(new Uint8Array([0xff, 0xfe, 0x80]))),
    ).toBe('malformed')
  })

  test('output past the byte cap is too large', async () => {
    // A tiny link that inflates far beyond the cap (a "deflate bomb").
    const bomb = await rawData(new Uint8Array(1_000_000))
    expect(bomb.length).toBeLessThan(MAX_OPEN_LINK_DATA)
    expect(await errorCode(bomb, 1000)).toBe('too-large')
  })
})

describe('openLinkUrl', () => {
  test('puts the data in the fragment under the app’s path', () => {
    expect(openLinkUrl('https://example.github.io/yodo/', 'abc')).toBe(
      'https://example.github.io/yodo/#/open/abc',
    )
  })

  test('replaces an existing fragment', () => {
    expect(openLinkUrl(new URL('http://localhost:8080/#/d/x'), 'abc')).toBe(
      'http://localhost:8080/#/open/abc',
    )
  })
})
