// Search over drawing names and canvas text, shared by both usage modes
// (ADR 0047). Pure: Home passes the summaries and the repository's index.

/** One drawing's canvas text, as `DrawingRepository.searchIndex()` returns it. */
export interface SearchIndexEntry {
  id: string
  searchText: string
}

/** A line of context around the first match; Home highlights `match`. */
export interface SearchSnippet {
  before: string
  match: string
  after: string
}

/** What search needs of a drawing; `DrawingSummary` fits (core never imports storage, ADR 0029). */
export interface Searchable {
  id: string
  name: string
}

export interface SearchResults<T extends Searchable> {
  /** Drawings whose name matches ("In names"). */
  names: T[]
  /** Drawings whose canvas text matches ("In text on the canvas"). */
  text: { summary: T; snippet: SearchSnippet }[]
}

/** Characters of context kept on each side of the match. */
const CONTEXT = 40

function fold(value: string): string {
  return value.toLocaleLowerCase()
}

/**
 * Finds `query` as a case-insensitive literal substring (not a pattern) in the
 * names of `summaries` and in their canvas text. A blank query matches
 * nothing. A drawing can be in both lists.
 */
export function searchDrawings<T extends Searchable>(
  summaries: T[],
  index: SearchIndexEntry[],
  query: string,
): SearchResults<T> {
  const needle = fold(query.trim())
  if (needle === '') return { names: [], text: [] }

  const names = summaries.filter((s) => fold(s.name).includes(needle))
  const texts = new Map(index.map((entry) => [entry.id, entry.searchText]))
  const text: SearchResults<T>['text'] = []
  for (const summary of summaries) {
    const snippet = snippetFor(texts.get(summary.id) ?? '', needle)
    if (snippet) text.push({ summary, snippet })
  }
  return { names, text }
}

function snippetFor(
  searchText: string,
  needle: string,
): SearchSnippet | undefined {
  // Newlines become spaces so a snippet is one line; the length is unchanged,
  // so positions found in the folded text still fit.
  const flat = searchText.replace(/\s/g, ' ')
  const at = fold(flat).indexOf(needle)
  if (at < 0) return undefined
  const end = at + needle.length
  const from = Math.max(0, at - CONTEXT)
  const to = Math.min(flat.length, end + CONTEXT)
  return {
    before: (from > 0 ? '…' : '') + flat.slice(from, at),
    match: flat.slice(at, end),
    after: flat.slice(end, to) + (to < flat.length ? '…' : ''),
  }
}
