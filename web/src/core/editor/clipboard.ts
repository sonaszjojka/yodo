// The clipboard payload for copied elements (ADR 0039) and where a paste
// lands. Pure: the editor and the DOM events build on it.
import { parseElements } from '../document/validate.ts'
import type { YodoElement } from '../document/types.ts'
import { elementBounds, unionBounds, type Bounds } from '../geometry/rect.ts'
import { DUPLICATE_OFFSET } from './selection.ts'

const MARKER = 'yodo/clipboard'
const VERSION = 1

/** Longer clipboard text is not parsed at all (characters). */
export const MAX_PAYLOAD_LENGTH = 50_000_000

/** The plain-text payload for `elements`, in draw order. */
export function serializeClipboard(elements: readonly YodoElement[]): string {
  return JSON.stringify({ type: MARKER, version: VERSION, elements })
}

/**
 * The valid elements of a Yodo clipboard payload, or null when the text isn't
 * one (plain text, other JSON, another version). Null means "not ours, leave
 * the paste alone"; an empty list means ours but nothing usable in it.
 */
export function parseClipboard(text: string): YodoElement[] | null {
  if (text.length > MAX_PAYLOAD_LENGTH) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { type?: unknown }).type !== MARKER ||
    (value as { version?: unknown }).version !== VERSION
  ) {
    return null
  }
  return parseElements((value as { elements?: unknown }).elements)
}

function intersects(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  )
}

/**
 * Copies of `copied` ready to add. They get new ids (the seed stays, so they
 * look the same, ADR 0004). The group stays where it was if any of it is
 * inside `view` (the visible world rectangle), otherwise it is centred on the
 * view; then it moves `steps` duplicate offsets down and right.
 */
export function pasteElements(
  copied: readonly YodoElement[],
  view: Bounds,
  steps: number,
  createId: () => string,
): YodoElement[] {
  const group = unionBounds(copied.map(elementBounds))
  if (!group) return []
  let dx = steps * DUPLICATE_OFFSET
  let dy = dx
  if (!intersects(group, view)) {
    dx += view.x + view.width / 2 - (group.x + group.width / 2)
    dy += view.y + view.height / 2 - (group.y + group.height / 2)
  }
  return copied.map((element) => ({
    ...element,
    id: createId(),
    x: element.x + dx,
    y: element.y + dy,
  }))
}
