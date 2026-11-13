// Hash routes (ADR 0007, 0033): `#/` is Home, `#/d/<id>` the editor on one
// drawing, `#/f/<id>` Home filtered to one folder (ADR 0045), `#/trash` the
// Trash (ADR 0046), `#/open/<data>` a drawing carried in the link (ADR 0069).
// Hashes work on GitHub Pages, which has no SPA fallback.

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home'; folderId?: string }
  | { name: 'trash' }
  | { name: 'drawing'; id: string }
  | { name: 'open'; data: string }

const DRAWING = /^#\/d\/([^/]+)$/
const FOLDER = /^#\/f\/([^/]+)$/
// Any characters: the open-link screen explains bad data instead of Home
// silently showing up.
const OPEN = /^#\/open\/(.*)$/

/** The route for a `location.hash`; anything unknown is Home. */
export function parseRoute(hash: string): Route {
  if (hash === '#/trash') return { name: 'trash' }
  const open = OPEN.exec(hash)
  if (open) return { name: 'open', data: open[1]! }
  const drawing = DRAWING.exec(hash)
  const folder = FOLDER.exec(hash)
  const match = drawing ?? folder
  if (!match) return { name: 'home' }
  try {
    const id = decodeURIComponent(match[1]!)
    return drawing ? { name: 'drawing', id } : { name: 'home', folderId: id }
  } catch {
    // A malformed escape (e.g. a hand-edited URL) can't name anything.
    return { name: 'home' }
  }
}

export function routeHash(route: Route): string {
  if (route.name === 'trash') return '#/trash'
  if (route.name === 'drawing') return `#/d/${encodeURIComponent(route.id)}`
  if (route.name === 'open') return `#/open/${route.data}`
  return route.folderId === undefined
    ? '#/'
    : `#/f/${encodeURIComponent(route.folderId)}`
}

/**
 * Goes to a route; it's a history entry, so Back and Forward work. `replace`
 * swaps the current entry instead, so Back skips it (an imported open link).
 */
export function navigate(route: Route, { replace = false } = {}) {
  if (replace) window.location.replace(routeHash(route))
  else window.location.hash = routeHash(route)
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

// The hash string is the snapshot: a primitive, so it's stable between
// renders. It's parsed after reading, never stored as a new object.
const getHash = () => window.location.hash

/** The current route, re-rendering when the hash changes. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getHash, () => ''))
}
