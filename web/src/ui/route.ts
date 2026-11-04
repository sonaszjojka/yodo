// Hash routes (ADR 0007, 0033): `#/` is Home, `#/d/<id>` the editor on one
// drawing. Hashes work on GitHub Pages, which has no SPA fallback.

import { useSyncExternalStore } from 'react'

export type Route = { name: 'home' } | { name: 'drawing'; id: string }

const DRAWING = /^#\/d\/([^/]+)$/

/** The route for a `location.hash`; anything unknown is Home. */
export function parseRoute(hash: string): Route {
  const match = DRAWING.exec(hash)
  if (!match) return { name: 'home' }
  try {
    return { name: 'drawing', id: decodeURIComponent(match[1]!) }
  } catch {
    // A malformed escape (e.g. a hand-edited URL) can't name a drawing.
    return { name: 'home' }
  }
}

export function routeHash(route: Route): string {
  return route.name === 'home' ? '#/' : `#/d/${encodeURIComponent(route.id)}`
}

/** Goes to a route; it's a history entry, so Back and Forward work. */
export function navigate(route: Route) {
  window.location.hash = routeHash(route)
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
