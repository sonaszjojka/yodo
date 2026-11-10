// Compact, agent-readable text for the read tools: ids and boxes rather than
// the raw document JSON, which would cost an agent many tokens to read (ADR
// 0061, research notes). Pure, so it is tested without the SDK.

import type {
  ArrowBinding,
  YodoDocument,
  YodoElement,
} from '../../web/src/core/document/types.ts'
import { drawnBounds } from '../../web/src/core/geometry/curve.ts'
import { unionBounds, type Bounds } from '../../web/src/core/geometry/rect.ts'
import type { SearchResults } from '../../web/src/core/search/match.ts'
import type { DrawingSummary } from '../../web/src/storage/repository.ts'

/** Elements listed by `formatDrawing`; the rest are counted, not listed. */
export const MAX_ELEMENTS = 500
/** Characters kept of a text or label. */
export const MAX_TEXT = 200

/** A string on one line, quoted: JSON escaping writes newlines as `\n`. */
function quote(text: string, max = MAX_TEXT): string {
  const chars = [...text]
  const kept = chars.length > max ? chars.slice(0, max).join('') + '…' : text
  return JSON.stringify(kept)
}

function box({ x, y, width, height }: Bounds): string {
  const r = Math.round
  return `${r(x)},${r(y)} ${r(width)}x${r(height)}`
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

export function formatSummaries(summaries: readonly DrawingSummary[]): string {
  if (summaries.length === 0) return 'No drawings yet.'
  const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt)
  const lines = sorted.map(
    (s) =>
      `${s.id}  ${quote(s.name)}  updated ${iso(s.updatedAt)}  rev ${s.revision}`,
  )
  const count =
    summaries.length === 1 ? '1 drawing' : `${summaries.length} drawings`
  return [
    `${count}, newest first (id, name, last saved, revision):`,
    ...lines,
  ].join('\n')
}

export function formatSearch(
  results: SearchResults<DrawingSummary>,
  query: string,
): string {
  if (results.names.length === 0 && results.text.length === 0) {
    return `No drawings match ${quote(query)}.`
  }
  const lines: string[] = []
  if (results.names.length > 0) {
    lines.push('In names:')
    for (const s of results.names) lines.push(`${s.id}  ${quote(s.name)}`)
  }
  if (results.text.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('In text on the canvas:')
    for (const { summary, snippet } of results.text) {
      const context = `${snippet.before}[${snippet.match}]${snippet.after}`
      lines.push(`${summary.id}  ${quote(summary.name)}  ${quote(context)}`)
    }
  }
  return lines.join('\n')
}

function binding(end: 'start' | 'end', b: ArrowBinding | undefined): string[] {
  if (!b) return []
  return 'along' in b
    ? [`${end}->${b.elementId}@along ${Math.round(b.along * 100) / 100}`]
    : [`${end}->${b.elementId}`]
}

/** The per-type details after an element's id, type and box. */
function details(element: YodoElement): string[] {
  const parts: string[] = []
  switch (element.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
    case 'note':
      if (element.label?.text) parts.push(`label ${quote(element.label.text)}`)
      break
    case 'text':
      parts.push(quote(element.text))
      break
    case 'image':
      parts.push(`file ${element.fileId}`)
      break
    case 'arrow':
      parts.push(...binding('start', element.startBinding))
      parts.push(...binding('end', element.endBinding))
      parts.push(
        `heads ${element.startArrowhead ?? 'none'}/${element.endArrowhead ?? 'none'}`,
      )
      parts.push(`${element.points.length} points`)
      if (element.curved) parts.push('curved')
      break
    case 'line':
      parts.push(`${element.points.length} points`)
      if (element.curved) parts.push('curved')
      break
    case 'pencil':
      parts.push(`${element.points.length} points`)
      break
  }
  const degrees = Math.round((element.angle * 180) / Math.PI)
  if (degrees % 360 !== 0) parts.push(`rotated ${degrees}deg`)
  return parts
}

/**
 * The drawing as an outline: a header with its id, revision and bounds, then
 * one line per element, bottom of the stack first. Boxes are what is drawn
 * (`drawnBounds`), so a curve's overshoot counts; rotation is reported, not
 * applied to the box.
 */
export function formatDrawing(doc: YodoDocument, revision: number): string {
  const boxes = doc.elements.map((element) => drawnBounds(element))
  const all = unionBounds(boxes)
  const lines = [
    `Drawing ${quote(doc.name)} (id ${doc.id}, rev ${revision})`,
    `${doc.elements.length} elements; bounds ${all ? box(all) : 'empty'}`,
  ]
  if (doc.elements.length > 0) {
    lines.push('Elements, bottom first (id type x,y widthxheight details):')
  }
  doc.elements.slice(0, MAX_ELEMENTS).forEach((element, i) => {
    lines.push(
      [element.id, element.type, box(boxes[i]), ...details(element)].join(' '),
    )
  })
  const hidden = doc.elements.length - MAX_ELEMENTS
  if (hidden > 0) lines.push(`… and ${hidden} more elements (truncated)`)
  return lines.join('\n')
}
