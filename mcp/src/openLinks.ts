// Open links for the file backend (ADR 0069): after a write, the agent gets the
// drawing's `.yodo` path and, when it fits, a link that opens it in the app.

import {
  encodeOpenLinkData,
  MAX_OPEN_LINK_DATA,
  openLinkUrl,
} from '../../web/src/core/document/openLink.ts'

export interface OpenLinks {
  /** `YODO_APP_URL`, the app the link opens. */
  appUrl: URL
  /** `FileDrawingRepository.exportFile`. */
  exportFile(
    id: string,
    revision: number,
  ): Promise<
    { path: string; text: string } | { path: string; changed: true } | undefined
  >
}

export interface OpenLinkResult {
  /** A sentence or two for the tool's text result. */
  text: string
  file?: string
  openUrl?: string
}

/**
 * The file and link for the revision this write saved. Never throws: a
 * write that succeeded stays a success even if no link can be made.
 */
export async function openLinkFor(
  links: OpenLinks,
  id: string,
  revision: number,
): Promise<OpenLinkResult> {
  let exported: Awaited<ReturnType<OpenLinks['exportFile']>>
  try {
    exported = await links.exportFile(id, revision)
  } catch (error) {
    return {
      text: `No open link: the file couldn't be read (${(error as Error).message}).`,
    }
  }
  if (!exported) return { text: 'No open link: the drawing is gone.' }
  const { path } = exported
  const file = `File: ${path}`
  if ('changed' in exported) {
    return {
      text:
        `${file}\nNo open link: the drawing changed after this write. ` +
        'Call get_drawing for its current state.',
      file: path,
    }
  }
  const data = await encodeOpenLinkData(exported.text)
  if (data.length > MAX_OPEN_LINK_DATA) {
    return {
      text:
        `${file}\nThe drawing is too large for a link (over ${MAX_OPEN_LINK_DATA} characters); ` +
        `import ${path} in Yodo instead (Import file on Home).`,
      file: path,
    }
  }
  const openUrl = openLinkUrl(links.appUrl, data)
  return { text: `${file}\nOpen in Yodo: ${openUrl}`, file: path, openUrl }
}
