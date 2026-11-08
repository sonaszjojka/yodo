import { describe, expect, test } from 'vitest'
import type { EditorState } from '../core/editor/editor.ts'
import { cursorFor } from './cursors.ts'
import { ERASER_CURSOR } from './eraserCursor.ts'

const base = {
  panning: false,
  tool: 'select',
  spaceHeld: false,
  move: null,
  resize: null,
  hoverHandle: null,
} as unknown as EditorState

const state = (patch: Partial<EditorState>) =>
  ({ ...base, ...patch }) as EditorState

describe('cursorFor', () => {
  test('the eraser shows its circle', () => {
    expect(cursorFor(state({ tool: 'eraser' }))).toBe(ERASER_CURSOR)
  })

  test('other draw tools keep the crosshair', () => {
    expect(cursorFor(state({ tool: 'rectangle' }))).toBe('crosshair')
  })

  test('an arrow end handle shows the crosshair', () => {
    expect(cursorFor(state({ hoverHandle: 'point' }))).toBe('crosshair')
  })

  test('holding space with the eraser still pans', () => {
    expect(cursorFor(state({ tool: 'eraser', spaceHeld: true }))).toBe('grab')
  })

  test('panning wins over the eraser', () => {
    expect(cursorFor(state({ tool: 'eraser', panning: true }))).toBe('grabbing')
  })
})
