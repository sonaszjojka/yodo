// Per-browser preferences in localStorage (ADR 0036): the defaults for new
// elements and the style panel's place. Stored values are untrusted, so every
// field is checked on load and falls back on its own; storage that is blocked
// or full only means nothing is remembered.
import { BUILT_IN_STYLE, type ElementStyle } from '../core/document/create.ts'
import type { Bounds } from '../core/geometry/rect.ts'

export const STYLE_DEFAULTS_KEY = 'yodo.styleDefaults'
export const PANEL_LAYOUT_KEY = 'yodo.stylePanel'

/** The parts of `Storage` used here, so tests can pass a fake. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface PanelLayout {
  open: boolean
  /** Screen px; null is the default place, at the right side. */
  place: Bounds | null
}

const DEFAULT_LAYOUT: PanelLayout = { open: false, place: null }

/** `localStorage`, read lazily: even reading the property can throw. */
function browserStorage(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The stored JSON object under `key`, or null for anything else. */
function read(
  key: string,
  storage: PreferenceStorage | null,
): Record<string, unknown> | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown, storage: PreferenceStorage | null) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Blocked or full storage: the preference is just not remembered.
  }
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** One check per field: whether a stored value can be used. */
const STYLE_CHECKS: {
  [K in keyof ElementStyle]: (value: unknown) => boolean
} = {
  strokeColor: (v) => typeof v === 'string' && v !== '',
  backgroundColor: (v) => typeof v === 'string' && v !== '',
  fillStyle: (v) => v === 'hachure' || v === 'cross-hatch' || v === 'solid',
  strokeWidth: (v) => isNumber(v) && v > 0,
  strokeStyle: (v) => v === 'solid' || v === 'dashed' || v === 'dotted',
  roughness: (v) => isNumber(v) && v >= 0,
  opacity: (v) => isNumber(v) && v >= 0 && v <= 100,
  fontFamily: (v) => v === 'hand' || v === 'sans' || v === 'mono',
  fontSize: (v) => isNumber(v) && v > 0,
  textAlign: (v) => v === 'left' || v === 'center' || v === 'right',
}

export function loadStyleDefaults(storage = browserStorage()): ElementStyle {
  const stored = read(STYLE_DEFAULTS_KEY, storage)
  if (!stored) return BUILT_IN_STYLE
  const style: Record<string, unknown> = { ...BUILT_IN_STYLE }
  for (const [key, check] of Object.entries(STYLE_CHECKS)) {
    if (check(stored[key])) style[key] = stored[key]
  }
  return style as ElementStyle
}

export function saveStyleDefaults(
  defaults: ElementStyle,
  storage = browserStorage(),
) {
  write(STYLE_DEFAULTS_KEY, defaults, storage)
}

function isPlace(value: unknown): value is Bounds {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, width, height } = value as Record<string, unknown>
  return (
    isNumber(x) &&
    isNumber(y) &&
    isNumber(width) &&
    isNumber(height) &&
    width > 0 &&
    height > 0
  )
}

export function loadPanelLayout(storage = browserStorage()): PanelLayout {
  const stored = read(PANEL_LAYOUT_KEY, storage)
  if (!stored) return DEFAULT_LAYOUT
  const place = stored.place
  return {
    open: stored.open === true,
    place: isPlace(place)
      ? { x: place.x, y: place.y, width: place.width, height: place.height }
      : null,
  }
}

export function savePanelLayout(
  layout: PanelLayout,
  storage = browserStorage(),
) {
  write(PANEL_LAYOUT_KEY, layout, storage)
}
