import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  createDocument,
  createLinear,
  createNote,
  createShape,
} from '../core/document/create.ts'
import { lineFromDrag } from '../core/geometry/line.ts'
import type { YodoElement } from '../core/document/types.ts'
import { createEditor } from '../core/editor/editor.ts'
import {
  barPosition,
  menuOffset,
  menuSize,
  popoverOffset,
} from './barPosition.ts'
import { MORE_ITEMS } from './moreItems.tsx'
import { MoreMenu, StyleBar } from './StyleBar.tsx'

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

  test('one selected arrow, which has no box frame, still gets its bar', () => {
    const arrow = createLinear(
      'arrow',
      lineFromDrag([300, 300], [400, 350], false),
    )
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([arrow])} />)
    expect(controls(html)).toContain('All styles')
    expect(controls(html)).toContain('More')
  })

  test('a shape gets stroke, fill, width and look, showing its values', () => {
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([rect])} />)
    expect(controls(html)).toEqual([
      'Stroke: Ink',
      'Fill: None',
      'Width: Bold',
      'Look: Hand-drawn',
      'All styles',
      'More',
    ])
  })

  test('a note gets text colour and note colour only', () => {
    const note = createNote({ x: 300, y: 300, width: 200, height: 200 })
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([note])} />)
    expect(controls(html)).toEqual([
      'Stroke: Ink',
      'Fill: Sand',
      'All styles',
      'More',
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
    expect(controls(html)).toEqual([
      'Stroke: Ink',
      'Font: Mono',
      'Size: XL',
      'All styles',
      'More',
    ])
  })

  test('different values show as mixed', () => {
    const red = { ...rect, id: 'red', strokeColor: '#C2453D' }
    const html = renderToStaticMarkup(
      <StyleBar editor={editorWith([rect, red])} />,
    )
    expect(controls(html)[0]).toBe('Stroke: Mixed')
  })
})

describe('MoreMenu', () => {
  const menu = (canPaste: boolean) =>
    renderToStaticMarkup(
      <MoreMenu
        editor={editorWith([rect])}
        canPaste={canPaste}
        onDone={() => {}}
      />,
    )

  test('lists the selection actions in order (docs/ui.md)', () => {
    const items = [...menu(true).matchAll(/<\/svg>([^<]+)<\/button>/g)].map(
      (m) => m[1],
    )
    expect(items).toEqual([
      'Duplicate',
      'Copy style',
      'Paste style',
      'Bring to front',
      'Delete',
    ])
  })

  test('renders one menu item per MORE_ITEMS entry', () => {
    const items = menu(true).match(/role="menuitem"/g)
    expect(items).toHaveLength(MORE_ITEMS.length)
  })

  test('Paste style is disabled until a style is copied', () => {
    expect(menu(false)).toMatch(/<button[^>]*disabled=""[^>]*>/)
    expect(menu(true)).not.toContain('disabled')
  })
})

describe('menuSize', () => {
  test('grows by one 36 px row per item', () => {
    expect(menuSize(6).height - menuSize(5).height).toBe(36)
    expect(menuSize(5).height).toBe(5 * 36 + 2 * 4 + 2)
  })
})

describe('menuOffset', () => {
  const window = { width: 1000, height: 800 }
  const count = 5

  test('opens below the bar when it fits, above near the bottom', () => {
    expect(menuOffset({ left: 100, top: 300 }, 0, count, window).top).toBe(50)
    expect(menuOffset({ left: 100, top: 700 }, 0, count, window).top).toBe(
      -menuSize(count).height - 10,
    )
  })

  test('flips sooner when the menu has more items', () => {
    // Bar at 520: five items end at 765 (limit 792) and fit below; six end at 801.
    const bar = { left: 100, top: 520 }
    expect(menuOffset(bar, 0, 5, window).top).toBe(50)
    expect(menuOffset(bar, 0, 6, window).top).toBe(-menuSize(6).height - 10)
  })

  test('stays inside the window at its right edge', () => {
    // Control 5 of a bar at 900: the menu shifts left to end 8 px from the edge.
    const { left } = menuOffset({ left: 900, top: 300 }, 5, count, window)
    const control = 900 + 5 + 5 * 42
    expect(control + left + menuSize(count).width).toBe(1000 - 8)
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
    expect(popoverOffset({ left: 100, top: 300 }, 0, 8, window).top).toBe(50)
  })

  test('opens above the bar near the bottom of the window', () => {
    const top = 800 - 8 - 50
    expect(popoverOffset({ left: 100, top }, 0, 8, window).top).toBe(-92 - 10)
  })

  test('lines up with its control', () => {
    expect(popoverOffset({ left: 100, top: 300 }, 0, 8, window).left).toBe(-5)
  })

  test('stays inside the window at its right edge', () => {
    // A 3-control text bar pinned right; Size (index 2, 176 wide) shifts left.
    const bar = { left: 1000 - 8 - 134, top: 300 }
    const control = bar.left + 5 + 2 * 42
    expect(popoverOffset(bar, 2, 4, window).left).toBe(1000 - 8 - 176 - control)
  })

  test('an exact size from the panel shows its number', () => {
    const text = {
      ...createShape('rectangle', { x: 0, y: 200, width: 50, height: 25 }),
      type: 'text' as const,
      text: 'Hi',
      fontFamily: 'hand' as const,
      fontSize: 44,
      textAlign: 'left' as const,
    }
    const html = renderToStaticMarkup(<StyleBar editor={editorWith([text])} />)
    expect(html).toContain('aria-label="Size: Custom"')
    expect(html).toMatch(/<span class="style-text"[^>]*>44<\/span>/)
  })
})
