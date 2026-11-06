// The text of a drawing's canvas that search looks in (ADR 0047): free text
// elements and the labels of shapes and notes. The drawing's name is not part
// of it; Home matches that from the summary.

import type { YodoDocument } from '../document/types.ts'

/** A UTF-16 surrogate that is not half of a valid pair. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Every text on the canvas, in element order, joined by newlines. Lone
 * surrogates become U+FFFD, because `encodeURIComponent` throws on them and the
 * text is sent in a header (ADR 0047).
 */
export function extractSearchText(doc: YodoDocument): string {
  const parts: string[] = []
  for (const element of doc.elements) {
    const value =
      element.type === 'text'
        ? element.text
        : 'label' in element
          ? element.label?.text
          : undefined
    if (typeof value === 'string' && value.trim() !== '') {
      parts.push(value.replace(LONE_SURROGATE, '�'))
    }
  }
  return parts.join('\n')
}

/**
 * `extractSearchText`, or '' when the document is too odd to read. Indexing is
 * derived data, so it must never block a save or a database upgrade (ADR 0047).
 */
export function safeSearchText(doc: YodoDocument): string {
  try {
    return extractSearchText(doc)
  } catch {
    return ''
  }
}
