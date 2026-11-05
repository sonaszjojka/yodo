// The two things an export does with its PNG: copy it and download it. The
// browser objects are passed in so tests can fake them.

export type CopyResult = 'copied' | 'unsupported' | 'failed'

export interface ClipboardLike {
  write(items: unknown[]): Promise<void>
}

/** Copies a PNG as an image. The blob stays a promise: Safari needs the write to start inside the click. */
export async function copyPng(
  blob: Promise<Blob>,
  clipboard: ClipboardLike | undefined,
  makeItem: ((data: Record<string, Promise<Blob>>) => unknown) | undefined,
): Promise<CopyResult> {
  if (!clipboard || !makeItem) return 'unsupported'
  try {
    await clipboard.write([makeItem({ 'image/png': blob })])
    return 'copied'
  } catch (error) {
    console.error('Could not copy the image', error)
    return 'failed'
  }
}

export interface DownloadHost {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createLink(): {
    href: string
    download: string
    click(): void
  }
}

/** Saves `blob` as `fileName` through a temporary link. */
export function downloadBlob(blob: Blob, fileName: string, host: DownloadHost) {
  const url = host.createObjectURL(blob)
  const link = host.createLink()
  link.href = url
  link.download = fileName
  link.click()
  host.revokeObjectURL(url)
}

/** `canvas.toBlob` as a promise; rejects when the browser can't encode. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not encode the PNG')),
      'image/png',
    )
  })
}
