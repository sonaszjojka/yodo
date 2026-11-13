// An image's size in pixels, read from its header without decoding it, so
// render_drawing can refuse a huge bitmap before allocating it (ADR 0070).
// Covers the raster types the app stores (IMAGE_TYPES, ADR 0040). The format
// is sniffed from the bytes, not taken from the declared type.

export interface PixelSize {
  width: number
  height: number
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) return false
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false
  }
  return true
}

function png(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  // Signature, then the IHDR chunk: length, type, width, height.
  if (bytes.length < 24 || !ascii(bytes, 12, 'IHDR')) return undefined
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function gif(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  if (bytes.length < 10) return undefined
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
}

/** Start-of-frame markers, the ones that carry the size. */
function isFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 && // Huffman tables
    marker !== 0xc8 && // reserved
    marker !== 0xcc // arithmetic coding conditioning
  )
}

function jpeg(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  let at = 2
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return undefined
    const marker = bytes[at + 1]!
    if (marker === 0xff) {
      at++ // fill byte
      continue
    }
    // Markers without a length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    if (at + 4 > bytes.length) return undefined
    const length = view.getUint16(at + 2)
    if (isFrameMarker(marker)) {
      // Length, precision, height, width.
      if (at + 9 > bytes.length) return undefined
      return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) }
    }
    if (marker === 0xd9 || marker === 0xda || length < 2) return undefined
    at += 2 + length
  }
  return undefined
}

function webp(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  if (ascii(bytes, 12, 'VP8 ')) {
    // A key frame: start code 9d 01 2a, then 14-bit width and height.
    if (bytes.length < 30) return undefined
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return undefined
    }
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  if (ascii(bytes, 12, 'VP8L')) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return undefined
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (ascii(bytes, 12, 'VP8X')) {
    if (bytes.length < 30) return undefined
    const uint24 = (at: number) =>
      bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
    return { width: uint24(24) + 1, height: uint24(27) + 1 }
  }
  return undefined
}

/** The image's width and height, or undefined when the header can't be read. */
export function imageSize(bytes: Uint8Array): PixelSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG')) return png(bytes, view)
  if (ascii(bytes, 0, 'GIF8')) return gif(bytes, view)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, view)
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) {
    return webp(bytes, view)
  }
  return undefined
}
