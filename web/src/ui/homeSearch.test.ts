import { describe, expect, test } from 'vitest'
import type { DrawingSummary } from '../storage/repository.ts'
import { isSearching, needsIndex, searchView } from './homeSearch.ts'

function summary(id: string, name: string, folderId?: string): DrawingSummary {
  return { id, name, createdAt: 1, updatedAt: 1, ...(folderId && { folderId }) }
}

const drawings = [
  summary('a', 'Budget', 'work'),
  summary('b', 'Notes'),
  summary('c', 'Trip'),
]

describe('isSearching', () => {
  test.each([
    ['', false],
    ['   ', false],
    ['x', true],
  ])('%j → %s', (query, expected) => {
    expect(isSearching(query)).toBe(expected)
  })
})

describe('needsIndex', () => {
  const entries = [{ id: 'a', searchText: 'x' }]

  test('is true before any index was read', () => {
    expect(needsIndex(undefined, drawings)).toBe(true)
  })

  test('is false for a finished index of the same list', () => {
    expect(
      needsIndex({ status: 'ready', forList: drawings, entries }, drawings),
    ).toBe(false)
  })

  // A drawing restored from Trash gives Home a new list; the old index
  // doesn't have it (ADR 0047).
  test('is true once the list changed, e.g. after a restore', () => {
    const state = { status: 'ready' as const, forList: drawings, entries }
    expect(needsIndex(state, [...drawings, summary('d', 'Restored')])).toBe(
      true,
    )
  })

  test('is true after a failure, so the next search tries again', () => {
    expect(needsIndex({ status: 'error', forList: drawings }, drawings)).toBe(
      true,
    )
  })
})

describe('searchView sorting', () => {
  const list = [
    summary('a', 'Beta'),
    summary('b', 'alpha'),
    summary('c', 'Gamma'),
  ]
  const ids = (view: ReturnType<typeof searchView>) =>
    view.results.names.map((d) => d.id)

  test('orders names by the chosen sort, as the grid does', () => {
    expect(ids(searchView(list, undefined, undefined, 'a', 'name'))).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  test('orders canvas-text rows by the chosen sort too', () => {
    const index = {
      status: 'ready' as const,
      forList: list,
      entries: list.map((d) => ({ id: d.id, searchText: 'needle' })),
    }
    const view = searchView(list, undefined, index, 'needle', 'name')
    expect(view.results.text.map((r) => r.summary.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('searchView', () => {
  test('matches names before the index arrives', () => {
    const view = searchView(drawings, undefined, undefined, 'note', 'recent')
    expect(view.results.names.map((d) => d.id)).toEqual(['b'])
    expect(view.textPending).toBe(true)
    expect(view.textFailed).toBe(false)
  })

  test('adds canvas text once the index for this list is ready', () => {
    const index = {
      status: 'ready' as const,
      forList: drawings,
      entries: [{ id: 'c', searchText: 'book the hotel' }],
    }
    const view = searchView(drawings, undefined, index, 'hotel', 'recent')
    expect(view.results.text.map((r) => r.summary.id)).toEqual(['c'])
    expect(view.textPending).toBe(false)
  })

  test('ignores an index read for an older list', () => {
    const stale = {
      status: 'ready' as const,
      forList: [...drawings],
      entries: [{ id: 'c', searchText: 'hotel' }],
    }
    const view = searchView(drawings, undefined, stale, 'hotel', 'recent')
    expect(view.results.text).toEqual([])
    expect(view.textPending).toBe(true)
  })

  test('reports a failed index and still matches names', () => {
    const view = searchView(
      drawings,
      undefined,
      { status: 'error', forList: drawings },
      'trip',
      'recent',
    )
    expect(view.textFailed).toBe(true)
    expect(view.textPending).toBe(false)
    expect(view.results.names.map((d) => d.id)).toEqual(['c'])
  })

  test('searches only the open folder', () => {
    const view = searchView(drawings, 'work', undefined, 'o', 'recent')
    expect(view.results.names.map((d) => d.id)).toEqual([])
    expect(
      searchView(drawings, 'work', undefined, 'bud', 'recent').results.names,
    ).toHaveLength(1)
  })
})
