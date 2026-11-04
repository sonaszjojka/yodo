import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { createDocument, createShape } from '../core/document/create.ts'
import type { YodoElement } from '../core/document/types.ts'
import { createEditor } from '../core/editor/editor.ts'
import { barPosition, popoverOffset } from './barPosition.ts'
import { StyleBar } from './StyleBar.tsx'

/** An editor with `elements`, Select active and the elements at `selected` selected. */
function editorWith(elements: YodoElement[], selected = elements) {
  const editor = createEditor({ ...createDocument(), elements })
  editor.store.setState((prev) => ({
    ...prev,
    selectedIds: selected.map((element) => element.id),
  }))
  return editor
}

const rect = createShape('rectangle', {
  x: 300,
  y: 300,
  width: 100,
  height: 100,
})

/** The accessible labels of the bar's buttons, in order. */
function controls(html: string) {
  return [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(
    (m) => m[1],
  )
}

describe('StyleBar', () => {
  test('renders nothing with no selection', () => {
    const editor = editorWith([rect], [])
    expect(renderToStaticMarkup(<StyleBar editor={editor} />)).toBe('')
  })

  test('renders nothing while a drag previews a move', () => {
    const editor = editorWith([rect])
    editor.store.setState((prev) => ({ ...prev, move: { dx: 5, dy: 0 } }))
    expect(renderToStaticMarkup(<StyleBar editor={editor} />)).toBe('')
  })

  test('renders nothing with another tool active', () => {
    const editor = editorWith([rect])
    editor.store.setState((prev) => ({ ...prev, tool: 'rectangle' }))
    expect(renderToStaticMarkup(<StyleBar editor={editor} />)).toBe('')
  })

  test('a shape gets stroke, fill, width and look, showing its values', () => {
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([rect])} />)
    expect(controls(html)).toEqual([
      'Stroke: Ink',
      'Fill: None',
      'Width: Bold',
      'Look: Hand-drawn',
    ])
  })

  test('a text gets stroke, font and size', () => {
    const text = {
      ...createShape('rectangle', { x: 0, y: 200, width: 50, height: 25 }),
      type: 'text' as const,
      text: 'Hi',
      fontFamily: 'mono' as const,
      fontSize: 36,
      textAlign: 'left' as const,
    }
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([text])} />)
    expect(controls(html)).toEqual(['Stroke: Ink', 'Font: Mono', 'Size: XL'])
  })

  test('different values show as mixed', () => {
    const red = { ...rect, id: 'red', strokeColor: '#C2453D' }
    const html = renderToStaticMarkup(
      <StyleBar editor={editorWith([rect, red])} />,
    )
    expect(controls(html)[0]).toBe('Stroke: Mixed')
  })
})

describe('barPosition', () => {
  const window = { width: 1000, height: 800 }

  test('centres the bar above the selection', () => {
    const outline = { x: 400, y: 300, width: 200, height: 100 }
    expect(barPosition(outline, 200, window)).toEqual({
      left: 400,
      top: 300 - 8 - 50,
    })
  })

  test('flips below the selection when the top bar is in the way', () => {
    const outline = { x: 400, y: 50, width: 200, height: 100 }
    expect(barPosition(outline, 200, window).top).toBe(50 + 100 + 8)
  })

  test('stays inside the window', () => {
    const outline = { x: -500, y: 300, width: 100, height: 100 }
    expect(barPosition(outline, 200, window).left).toBe(8)
    const right = { x: 990, y: 300, width: 100, height: 100 }
    expect(barPosition(right, 200, window).left).toBe(1000 - 8 - 200)
  })
})

describe('popoverOffset', () => {
  const window = { width: 1000, height: 800 }

  test('opens below the bar when it fits', () => {
    // 8 colours: 4 × 2, so 4·40 + 3·2 + 10 = 176 wide, 2·40 + 2 + 10 = 92 tall.
    expect(popoverOffset({ left: 100, top: 300 }, 8, window).top).toBe(50)
  })

  test('opens above the bar near the bottom of the window', () => {
    const top = 800 - 8 - 50
    expect(popoverOffset({ left: 100, top }, 8, window).top).toBe(-92 - 10)
  })
})
