// The styles the contextual bar edits (roadmap 2.1, docs/ui.md): which fit
// which element, what a selection has in common, and applying a change as
// one new document (one undo step, ADR 0023).
import type {
  BaseElement,
  TextElement,
  YodoDocument,
  YodoElement,
} from '../document/types.ts'
import type { Measure } from '../text/layout.ts'
import { withText } from './text.ts'

export type StyleKey =
  | 'strokeColor'
  | 'backgroundColor'
  | 'strokeWidth'
  | 'roughness'
  | 'fontFamily'
  | 'fontSize'

export type StylePatch = Partial<
  Pick<
    BaseElement,
    'strokeColor' | 'backgroundColor' | 'strokeWidth' | 'roughness'
  > &
    Pick<TextElement, 'fontFamily' | 'fontSize'>
>

type StyleValue<K extends StyleKey> = Required<StylePatch>[K]

/** Per style: the value every element it fits shares, or 'mixed'. Absent when none fits. */
export type CommonStyle = { [K in StyleKey]?: StyleValue<K> | 'mixed' }

/** The styles that change how `element` looks, in the bar's order. */
export function stylesOf(element: YodoElement): StyleKey[] {
  switch (element.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return ['strokeColor', 'backgroundColor', 'strokeWidth', 'roughness']
    case 'line':
    case 'arrow':
      return ['strokeColor', 'strokeWidth', 'roughness']
    // A plain smoothed path (ADR 0024): rough.js roughness has no effect.
    case 'pencil':
      return ['strokeColor', 'strokeWidth']
    case 'text':
      return ['strokeColor', 'fontFamily', 'fontSize']
  }
}

function valueOf(element: YodoElement, key: StyleKey) {
  return (element as unknown as Record<StyleKey, StyleValue<StyleKey>>)[key]
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

/** `element` with the parts of `patch` that fit it, or itself if none changes it. */
function styled(
  element: YodoElement,
  patch: StylePatch,
  measure: Measure,
): YodoElement {
  const changes: Record<string, unknown> = {}
  for (const key of stylesOf(element)) {
    const value = patch[key]
    if (value !== undefined && value !== valueOf(element, key)) {
      changes[key] = value
    }
  }
  if (Object.keys(changes).length === 0) return element
  const next = { ...element, ...changes } as YodoElement
  // A new font or size changes the text's box; its top-left stays put.
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
