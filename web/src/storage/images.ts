// Image blobs, stored apart from the drawing and keyed by the SHA-256 of their
// bytes, so identical images are stored once (ADR 0013, 0040). Hosted mode
// keeps them in IndexedDB, self-hosted mode on the server; one contract suite
// (`imageContract.ts`) runs against each implementation (ADR 0011).

export interface ImageRepository {
  /** Stores the bytes and returns their hash (lowercase hex SHA-256). Storing the same bytes again is harmless. */
  put(blob: Blob): Promise<string>
  /** The stored image, or undefined for a hash that was never stored. */
  get(hash: string): Promise<Blob | undefined>
  has(hash: string): Promise<boolean>
}

/** Raster types only: an SVG served back from our origin could run scripts (ADR 0040). */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

/** The server refuses larger uploads (ADR 0040). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** A fileId and a URL segment are exactly this: 64 lowercase hex digits. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/**
 * SHA-256 in plain JavaScript. `crypto.subtle` exists only in secure contexts,
 * and self-hosted Yodo is often opened over plain HTTP on a LAN address
 * (ADR 0013, 0040), so this is the fallback. Exported for tests.
 */
export function sha256Fallback(bytes: Uint8Array): string {
  const length = bytes.length
  // Message, 0x80, zero padding, then the bit length as 64 bits.
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64)
  padded.set(bytes)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000))
  view.setUint32(padded.length - 4, (length << 3) >>> 0)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[]
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)
      const ch = (e! & f!) ^ (~e! & g!)
      const t1 = (hh! + s1 + ch + K[i]! + w[i]!) | 0
      const s0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const t2 = (s0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d! + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    const next = [a, b, c, d, e, f, g, hh] as number[]
    for (let i = 0; i < 8; i++) h[i] = (h[i]! + next[i]!) | 0
  }
  return [...h].map((n) => n.toString(16).padStart(8, '0')).join('')
}

/** Lowercase hex SHA-256 of `bytes`: the Web Crypto API when there is one. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return sha256Fallback(new Uint8Array(bytes))
}

/** A problem with a picked image that the person can read as is. */
export class ImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageError'
  }
}

export interface StoredImage {
  /** The hash under which the image is stored: an element's `fileId`. */
  fileId: string
  /** The image's natural size in pixels. */
  width: number
  height: number
}

export interface IngestOptions {
  /** Reads the natural size; also the check that the bytes are an image. Defaults to `createImageBitmap`. */
  decode?: (file: Blob) => Promise<{ width: number; height: number }>
}

async function decodeSize(file: Blob) {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  return { width, height }
}

/**
 * Checks a pasted file (type, size, that it decodes), stores it and returns
 * what an image element needs. Throws `ImageError` with a readable message.
 */
export async function ingestImage(
  file: Blob,
  images: ImageRepository,
  { decode = decodeSize }: IngestOptions = {},
): Promise<StoredImage> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageError('Only PNG, JPEG, GIF and WebP images can be added.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError('That image is larger than 10 MB.')
  }
  let size: { width: number; height: number }
  try {
    size = await decode(file)
  } catch {
    throw new ImageError("That image couldn't be read.")
  }
  if (!(size.width > 0 && size.height > 0)) {
    throw new ImageError("That image couldn't be read.")
  }
  const fileId = await images.put(file)
  return { fileId, ...size }
}
