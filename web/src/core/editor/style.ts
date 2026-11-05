// The styles the contextual bar and the style panel edit (roadmap 2.1, 2.2a,
// docs/ui.md): which fit which element, what a selection has in common, and
// applying a change as one new document (one undo step, ADR 0023) or to the
// defaults for new elements (ADR 0036).
import type { ElementStyle } from '../document/create.ts'
import type { YodoDocument, YodoElement } from '../document/types.ts'
import type { Measure } from '../text/layout.ts'
import { withText } from './text.ts'

export type StyleKey = keyof ElementStyle

export type StylePatch = Partial<ElementStyle>

type StyleValue<K extends StyleKey> = Required<StylePatch>[K]

/** Per style: the value every element it fits shares, or 'mixed'. Absent when none fits. */
export type CommonStyle = { [K in StyleKey]?: StyleValue<K> | 'mixed' }

/** The styles that change how `element` looks, in the panel's order. */
export function stylesOf(element: YodoElement): StyleKey[] {
  switch (element.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return [
        'strokeColor',
        'backgroundColor',
        'fillStyle',
        'strokeWidth',
        'strokeStyle',
        'roughness',
        // An ellipse has no corners.
        ...(element.type === 'ellipse' ? [] : (['roundness'] as const)),
        'opacity',
      ]
    // A note has a fixed paper look (ADR 0038): only its colours and opacity.
    case 'note':
      return ['strokeColor', 'backgroundColor', 'opacity']
    // A picture has no outline or fill: only its opacity (ADR 0040).
    case 'image':
      return ['opacity']
    case 'line':
    case 'arrow':
      return [
        'strokeColor',
        'strokeWidth',
        'strokeStyle',
        'roughness',
        'opacity',
      ]
    // A plain smoothed path (ADR 0024): rough.js roughness has no effect.
    case 'pencil':
      return ['strokeColor', 'strokeWidth', 'strokeStyle', 'opacity']
    case 'text':
      return ['strokeColor', 'fontFamily', 'fontSize', 'textAlign', 'opacity']
  }
}

function valueOf(element: YodoElement, key: StyleKey) {
  const value = (
    element as unknown as Partial<Record<StyleKey, StyleValue<StyleKey>>>
  )[key]
  // Documents from before corners existed have no `roundness` (types.ts).
  return value ?? (key === 'roundness' ? 'sharp' : value)
}

export function commonStyle(selected: readonly YodoElement[]): CommonStyle {
  const style: Record<string, unknown> = {}
  for (const element of selected) {
    for (const key of stylesOf(element)) {
      const value = valueOf(element, key)
      if (!(key in style)) style[key] = value
      else if (style[key] !== value) style[key] = 'mixed'
    }
  }
  return style as CommonStyle
}

/**
 * The styles every element in `selected` shares, without the mixed ones:
 * what "copy style" and "use as default" take (roadmap 2.2b).
 */
export function sharedStyle(selected: readonly YodoElement[]): StylePatch {
  const shared: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(commonStyle(selected))) {
    if (value !== 'mixed') shared[key] = value
  }
  return shared as StylePatch
}

/** `element` with the parts of `patch` that fit it, or itself if none changes it. */
function styled(
  element: YodoElement,
  patch: StylePatch,
  measure: Measure,
): YodoElement {
  const changes: Record<string, unknown> = {}
  for (const key of stylesOf(element)) {
    const value = patch[key]
    // A note always keeps a colour (ADR 0038).
    if (
      element.type === 'note' &&
      key === 'backgroundColor' &&
      value === 'transparent'
    )
      continue
    if (value !== undefined && value !== valueOf(element, key)) {
      changes[key] = value
    }
  }
  if (Object.keys(changes).length === 0) return element
  const next = { ...element, ...changes } as YodoElement
  // A new font or size changes the text's box; its top-left stays put. An
  // alignment change only moves the lines inside the box.
  return next.type === 'text' &&
    ('fontFamily' in changes || 'fontSize' in changes)
    ? withText(next, next.text, measure)
    : next
}

/**
 * Applies `patch` to the elements in `ids`, each only where a style fits.
 * Returns the same document when nothing changes, so it is no undo step.
 */
export function applyStyle(
  document: YodoDocument,
  ids: readonly string[],
  patch: StylePatch,
  measure: Measure,
): YodoDocument {
  const targets = new Set(ids)
  let changed = false
  const elements = document.elements.map((element) => {
    if (!targets.has(element.id)) return element
    const next = styled(element, patch, measure)
    if (next !== element) changed = true
    return next
  })
  return changed ? { ...document, elements } : document
}

/** `defaults` with `patch` applied, or itself if nothing changes (ADR 0036). */
export function applyDefaults(
  defaults: ElementStyle,
  patch: StylePatch,
): ElementStyle {
  const keys = Object.keys(patch) as StyleKey[]
  const changed = keys.some(
    (key) => patch[key] !== undefined && patch[key] !== defaults[key],
  )
  if (!changed) return defaults
  const next: Record<string, unknown> = { ...defaults }
  for (const key of keys) if (patch[key] !== undefined) next[key] = patch[key]
  return next as ElementStyle
}
