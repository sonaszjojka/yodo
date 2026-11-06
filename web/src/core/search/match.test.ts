import { describe, expect, test } from 'vitest'
import type { DrawingSummary } from '../../storage/repository.ts'
import { searchDrawings, type SearchIndexEntry } from './match.ts'

function summary(id: string, name: string): DrawingSummary {
  return { id, name, createdAt: 1, updatedAt: 1 }
}

const plan = summary('1', 'Budget plan')
const notes = summary('2', 'Meeting notes')
const other = summary('3', 'Other')

describe('searchDrawings', () => {
  test('finds names, ignoring case and surrounding spaces', () => {
    const result = searchDrawings([plan, notes], [], '  BUDGET ')
    expect(result.names).toEqual([plan])
    expect(result.text).toEqual([])
  })

  test('finds canvas text and builds a highlighted snippet', () => {
    const index: SearchIndexEntry[] = [
      { id: '2', searchText: 'agenda\nThe budget is due' },
    ]
    const result = searchDrawings([plan, notes], index, 'budget')
    expect(result.names).toEqual([plan])
    expect(result.text).toEqual([
      {
        summary: notes,
        snippet: { before: 'agenda The ', match: 'budget', after: ' is due' },
      },
    ])
  })

  test('a drawing matching both ways is in both lists', () => {
    const result = searchDrawings(
      [plan],
      [{ id: '1', searchText: 'budget line' }],
      'budget',
    )
    expect(result.names).toEqual([plan])
    expect(result.text).toHaveLength(1)
  })

  test('shortens long context with ellipses on the cut sides', () => {
    const long = `${'a'.repeat(100)} needle ${'b'.repeat(100)}`
    const { text } = searchDrawings(
      [other],
      [{ id: '3', searchText: long }],
      'needle',
    )
    const { before, match, after } = text[0]!.snippet
    expect(match).toBe('needle')
    expect(before.startsWith('…')).toBe(true)
    expect(after.endsWith('…')).toBe(true)
    expect(before.length).toBeLessThanOrEqual(41)
    expect(after.length).toBeLessThanOrEqual(41)
  })

  test('has no ellipsis when the match is near the edges', () => {
    const { text } = searchDrawings(
      [other],
      [{ id: '3', searchText: 'needle' }],
      'needle',
    )
    expect(text[0]!.snippet).toEqual({ before: '', match: 'needle', after: '' })
  })

  test('treats the query literally, not as a pattern', () => {
    const index = [{ id: '3', searchText: 'cost (a+b)*2' }]
    expect(searchDrawings([other], index, '(a+b)*').text).toHaveLength(1)
    expect(searchDrawings([other], index, '.*').text).toHaveLength(0)
  })

  test('an empty or blank query matches nothing', () => {
    const index = [{ id: '1', searchText: 'budget' }]
    for (const query of ['', '   ']) {
      expect(searchDrawings([plan], index, query)).toEqual({
        names: [],
        text: [],
      })
    }
  })

  test('ignores index entries of drawings not in the given list', () => {
    const index = [{ id: 'gone', searchText: 'budget' }]
    expect(searchDrawings([plan], index, 'budget').text).toEqual([])
  })
})
