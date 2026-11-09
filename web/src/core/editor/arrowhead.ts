// Editing arrowheads (ADR 0055): what the selected arrows have at each end,
// and changing it as one new document (one undo step, ADR 0023).
import type {
  ArrowElement,
  Arrowhead,
  YodoDocument,
  YodoElement,
} from '../document/types.ts'

export type HeadEnd = 'start' | 'end'

/** The head `arrow` has at `end`; none for an absent start head. */
export function headAt(arrow: ArrowElement, end: HeadEnd): Arrowhead | null {
  return (end === 'start' ? arrow.startArrowhead : arrow.endArrowhead) ?? null
}

/**
 * The head every arrow in `selected` has at `end`, or 'mixed'. Undefined when
 * the selection holds no arrow, since nothing else has a head.
 */
export function commonArrowhead(
  selected: readonly YodoElement[],
  end: HeadEnd,
): Arrowhead | null | 'mixed' | undefined {
  let common: Arrowhead | null | 'mixed' | undefined
  for (const element of selected) {
    if (element.type !== 'arrow') continue
    const head = headAt(element, end)
    if (common === undefined) common = head
    else if (common !== head) common = 'mixed'
  }
  return common
}

/**
 * The arrows in `ids` with `head` at `end`; other elements are left alone. A
 * start head of none is the absent field. The same document comes back when
 * nothing changes, so it is no undo step.
 */
export function applyArrowhead(
  document: YodoDocument,
  ids: readonly string[],
  end: HeadEnd,
  head: Arrowhead | null,
): YodoDocument {
  const targets = new Set(ids)
  let changed = false
  const elements = document.elements.map((element): YodoElement => {
    if (element.type !== 'arrow' || !targets.has(element.id)) return element
    if (headAt(element, end) === head) return element
    changed = true
    if (end === 'end') return { ...element, endArrowhead: head }
    const { startArrowhead: _old, ...rest } = element
    return head === null ? rest : { ...rest, startArrowhead: head }
  })
  return changed ? { ...document, elements } : document
}
