// Blob <-> base64, for the images inlined in a `.yodo` file (ADR 0013).

const CHUNK = 0x8000

/** The blob's bytes as standard base64. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // btoa wants a string; build it in slices, as one huge spread would overflow the stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** A blob of `mimeType` holding the bytes `data` encodes. */
export function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
