// Open links (ADR 0069): a `.yodo` file's text carried in the URL fragment as
// `#/open/<data>`, where `<data>` is the UTF-8 text compressed with raw
// deflate, then base64url without padding. A fragment is never sent to a
// server, so the drawing stays local. Uses only Web Streams and `btoa`/`atob`,
// which browsers and Node both have, so the MCP server builds links with it.

/** The longest `<data>` a link may carry, in characters. */
export const MAX_OPEN_LINK_DATA = 16_384

/** Inflating stops past this many bytes: the file-import limit (50 MB). */
export const MAX_OPEN_LINK_BYTES = 50 * 1024 * 1024

export class OpenLinkError extends Error {
  readonly code: 'too-long' | 'malformed' | 'too-large'

  constructor(code: OpenLinkError['code'], message: string) {
    super(message)
    this.name = 'OpenLinkError'
    this.code = code
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** Reads a stream to the end, failing once it passes `maxBytes`. */
async function readAll(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new OpenLinkError('too-large', 'The link’s drawing is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Pipes `bytes` through a (de)compression stream. */
function transform(
  bytes: Uint8Array,
  through: CompressionStream | DecompressionStream,
  maxBytes = Infinity,
): Promise<Uint8Array> {
  const source = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream()
  return readAll(source.pipeThrough(through), maxBytes)
}

function toBase64url(bytes: Uint8Array): string {
  // `btoa` takes a binary string; build it in slices so a long array never
  // goes through one call's argument list.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(data: string): Uint8Array {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** The `<data>` part of an open link for a `.yodo` file's text. */
export async function encodeOpenLinkData(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  return toBase64url(
    await transform(bytes, new CompressionStream('deflate-raw')),
  )
}

/**
 * The `.yodo` text an open link carries. Throws an `OpenLinkError`: `too-long`
 * over `MAX_OPEN_LINK_DATA`, `malformed` for anything that isn't the encoding
 * above (bad characters, a damaged or cut-off stream, text that isn't UTF-8),
 * and `too-large` once inflating passes `maxBytes`.
 */
export async function decodeOpenLinkData(
  data: string,
  maxBytes: number = MAX_OPEN_LINK_BYTES,
): Promise<string> {
  if (data.length > MAX_OPEN_LINK_DATA) {
    throw new OpenLinkError('too-long', 'The link is too long')
  }
  // One leftover character can't be a whole byte in base64.
  if (!BASE64URL.test(data) || data.length % 4 === 1) {
    throw new OpenLinkError('malformed', 'The link is damaged')
  }
  let bytes: Uint8Array
  try {
    bytes = await transform(
      fromBase64url(data),
      new DecompressionStream('deflate-raw'),
      maxBytes,
    )
  } catch (error) {
    if (error instanceof OpenLinkError) throw error
    throw new OpenLinkError('malformed', 'The link is damaged')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new OpenLinkError('malformed', 'The link is damaged')
  }
}

/** The full link: `appUrl` with its fragment set to `#/open/<data>`. */
export function openLinkUrl(appUrl: URL | string, data: string): string {
  const url = new URL(appUrl)
  url.hash = `/open/${data}`
  return url.href
}
