// What the open-link screen does (ADR 0069), apart from the screen: read the
// link, word its errors, and import it once without overtaking a route change.

import { parseYodoFile } from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import { decodeOpenLinkData, OpenLinkError } from '../core/document/openLink.ts'

export type OpenLinkRead =
  | { status: 'ready'; text: string; name: string; elementCount: number }
  | { status: 'error'; message: string }

const DAMAGED = 'This link is damaged or incomplete. Ask for a new one.'

/** What to tell the user when a link can't be read or imported. */
export function openLinkErrorMessage(error: unknown): string {
  if (error instanceof OpenLinkError) {
    return error.code === 'too-long'
      ? 'This link is too long for Yodo to open.'
      : DAMAGED
  }
  if (error instanceof DocumentError) {
    return error.code === 'newer-version'
      ? 'This link was made by a newer version of Yodo. Update Yodo to open it.'
      : DAMAGED
  }
  return 'Couldn’t open this link. Try again.'
}

/**
 * Decodes and parses the link before anything is stored, so a bad one shows
 * an error and the confirmation can name the drawing.
 */
export async function readOpenLink(data: string): Promise<OpenLinkRead> {
  try {
    const text = await decodeOpenLinkData(data)
    const { document } = parseYodoFile(text)
    return {
      status: 'ready',
      text,
      name: document.name,
      elementCount: document.elements.length,
    }
  } catch (error) {
    return { status: 'error', message: openLinkErrorMessage(error) }
  }
}

export interface OpenerDeps {
  /** The closing editor's last save, which the import must not overtake. */
  waitForEditor(): Promise<unknown>
  /** Imports the `.yodo` text as a new drawing and returns its id. */
  importText(text: string): Promise<string>
  /** Whether the user is still on this link; false after any route change. */
  isCurrent(): boolean
  /** Opens the new drawing in place of the link. */
  show(id: string): void
}

/**
 * Imports at most one link at a time, and shows the drawing only if the user
 * is still on the link when the import finishes: a later route change wins,
 * and the imported drawing stays on Home. Import errors reach the caller.
 */
export type Opener = (text: string) => Promise<'opened' | 'busy' | 'left'>

export function createOpener(deps: OpenerDeps): Opener {
  let busy = false
  return async function open(text) {
    if (busy) return 'busy'
    busy = true
    try {
      await deps.waitForEditor()
      const id = await deps.importText(text)
      if (!deps.isCurrent()) return 'left'
      deps.show(id)
      return 'opened'
    } finally {
      busy = false
    }
  }
}
