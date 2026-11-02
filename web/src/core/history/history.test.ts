import { expect, test } from 'vitest'
import { createHistory } from './history.ts'

test('undo returns the recorded states newest first, redo replays them', () => {
  const history = createHistory<string>()
  history.record('a')
  history.record('b')

  expect(history.undo('c')).toBe('b')
  expect(history.undo('b')).toBe('a')
  expect(history.undo('a')).toBeNull()
  expect(history.redo('a')).toBe('b')
  expect(history.redo('b')).toBe('c')
  expect(history.redo('c')).toBeNull()
})

test('an empty history has nothing to undo or redo', () => {
  const history = createHistory<string>()

  expect(history.undo('a')).toBeNull()
  expect(history.redo('a')).toBeNull()
  expect(history.status.getState()).toEqual({ canUndo: false, canRedo: false })
})

test('recording a new step clears the redo stack', () => {
  const history = createHistory<string>()
  history.record('a')
  history.undo('b')

  history.record('a')

  expect(history.redo('c')).toBeNull()
  expect(history.undo('c')).toBe('a')
})

test('keeps at most `limit` steps, dropping the oldest', () => {
  const history = createHistory<number>(2)
  history.record(1)
  history.record(2)
  history.record(3)

  expect(history.undo(4)).toBe(3)
  expect(history.undo(3)).toBe(2)
  expect(history.undo(2)).toBeNull()
})

test('status tells whether undo and redo are available', () => {
  const history = createHistory<string>()
  const seen: unknown[] = []
  history.status.subscribe(() => seen.push(history.status.getState()))

  history.record('a')
  history.undo('b')
  history.redo('a')

  expect(seen).toEqual([
    { canUndo: true, canRedo: false },
    { canUndo: false, canRedo: true },
    { canUndo: true, canRedo: false },
  ])
})
