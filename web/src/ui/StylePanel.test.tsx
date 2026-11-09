import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  BUILT_IN_STYLE,
  createDocument,
  createLinear,
  createShape,
  createText,
} from '../core/document/create.ts'
import type { YodoElement } from '../core/document/types.ts'
import { lineFromDrag } from '../core/geometry/line.ts'
import { createEditor } from '../core/editor/editor.ts'
import { createStore } from '../core/store/store.ts'
import type { PanelLayout } from '../storage/preferences.ts'
import { StyleBar } from './StyleBar.tsx'
import { StylePanel, StylePanelToggle } from './StylePanel.tsx'

function editorWith(elements: YodoElement[], selected = elements) {
  const editor = createEditor({ ...createDocument(), elements })
  editor.store.setState((prev) => ({
    ...prev,
    selectedIds: selected.map((element) => element.id),
  }))
  return editor
}

const openPanel = () => createStore<PanelLayout>({ open: true, place: null })

const rect = createShape('rectangle', {
  x: 300,
  y: 300,
  width: 100,
  height: 100,
})
const text = {
  ...createText([300, 500], 1),
  text: 'Hi',
  width: 22,
  height: 25,
}

function render(editor: ReturnType<typeof editorWith>, panel = openPanel()) {
  return renderToStaticMarkup(<StylePanel editor={editor} panel={panel} />)
}

/** The section titles, in order. */
function sections(html: string) {
  return [...html.matchAll(/<h3[^>]*>([^<]+)</g)].map((m) => m[1])
}

/** The opening tag of the button whose text ends with `label`. */
function button(html: string, label: string) {
  const match = [
    ...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g),
  ]
    .map((m) => m[0])
    .find((tag) => tag.endsWith(`${label}</button>`))
  return match?.slice(0, match.indexOf('>') + 1) ?? ''
}

/** The accessible label of every pressed option. */
function pressed(html: string) {
  return [
    ...html.matchAll(
      /<button[^>]*aria-label="([^"]+)"[^>]*aria-pressed="true"/g,
    ),
  ].map((m) => m[1])
}

describe('StylePanel', () => {
  test('renders nothing when closed', () => {
    const panel = createStore<PanelLayout>({ open: false, place: null })
    expect(render(editorWith([rect]), panel)).toBe('')
  })

  test('renders nothing while a drag previews a move', () => {
    const editor = editorWith([rect])
    editor.store.setState((prev) => ({ ...prev, move: { dx: 5, dy: 0 } }))
    expect(render(editor)).toBe('')
  })

  test('a shape gets every shape section and Delete', () => {
    const html = render(editorWith([rect]))
    expect(html).toContain('>Style</h2>')
    expect(sections(html)).toEqual([
      'Stroke',
      'Background',
      'Fill style',
      'Stroke width',
      'Stroke style',
      'Look',
      'Corners',
      'Opacity',
      'Layers',
      'Copy / paste style',
    ])
    expect(pressed(html)).toEqual([
      'Ink',
      'None',
      'Hatched',
      'Bold',
      'Solid',
      'Hand-drawn',
      'Sharp',
    ])
    for (const action of [
      'To back',
      'Backward',
      'Forward',
      'To front',
      'Copy style',
      'Use as default',
      'Delete',
    ]) {
      expect(html).toContain(`</svg>${action}</button>`)
    }
  })

  test('Paste style is disabled until a style is copied', () => {
    const editor = editorWith([rect])
    expect(button(render(editor), 'Paste style')).toContain('disabled')
    editor.copyStyle()
    expect(button(render(editor), 'Paste style')).not.toContain('disabled')
  })

  test('a round shape shows Round pressed under Corners', () => {
    const html = render(editorWith([{ ...rect, roundness: 'round' }]))
    expect(html).toMatch(/Corners<span class="panel-section-value">Round/)
    expect(pressed(html)).toContain('Round')
  })

  test('an ellipse has no corners', () => {
    const ellipse = createShape('ellipse', {
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    })
    expect(sections(render(editorWith([ellipse])))).not.toContain('Corners')
  })

  test('a text gets colour, font with previews, size, exact size, alignment, opacity', () => {
    const html = render(editorWith([text]))
    expect(sections(html)).toEqual([
      'Stroke',
      'Font',
      'Size',
      'Alignment',
      'Opacity',
      'Layers',
      'Copy / paste style',
    ])
    expect(html).toMatch(
      /<span class="panel-font" style="font-family:[^"]*Caveat/,
    )
    expect(html).toMatch(/<input[^>]*type="number"[^>]*value="20"/)
    expect(pressed(html)).toContain('Left')
  })

  test('different values show as mixed', () => {
    const red = { ...rect, id: 'red', strokeColor: '#C2453D', opacity: 50 }
    const html = render(editorWith([rect, red]))
    expect(html).toMatch(/Stroke<span class="panel-section-value">Mixed/)
    expect(html).toMatch(/Opacity<span class="panel-section-value">Mixed/)
    expect(pressed(html)).not.toContain('Ink')
  })

  test('with nothing selected it edits the defaults and says so', () => {
    const editor = editorWith([rect], [])
    editor.setStyle({ strokeStyle: 'dashed' })
    const html = render(editor)

    expect(html).toContain('Defaults for new elements')
    expect(html).toContain('these apply to what you draw next')
    expect(sections(html)).toEqual([
      'Stroke',
      'Background',
      'Fill style',
      'Stroke width',
      'Stroke style',
      'Look',
      'Corners',
      'Font',
      'Size',
      'Alignment',
      'Opacity',
    ])
    expect(pressed(html)).toContain('Dashed')
    expect(html).not.toContain('Delete')
    expect(html).not.toContain('Use as default')
    expect(html).not.toContain('Paste style')
  })

  test('agrees with the bar after a change from either', () => {
    const editor = editorWith([rect])
    editor.setStyle({ strokeColor: '#C2453D', strokeWidth: 4 })

    const bar = renderToStaticMarkup(<StyleBar editor={editor} />)
    const panel = render(editor)
    expect(bar).toContain('aria-label="Stroke: Brick"')
    expect(bar).toContain('aria-label="Width: Extra bold"')
    expect(pressed(panel)).toEqual(
      expect.arrayContaining(['Brick', 'Extra bold']),
    )
    expect(editor.store.getState().defaults).toBe(BUILT_IN_STYLE)
  })

  test('the snap-back button shows only once moved', () => {
    expect(render(editorWith([rect]))).not.toContain('Snap back')
    const moved = createStore<PanelLayout>({
      open: true,
      place: { x: 40, y: 100, width: 300, height: 400 },
    })
    const html = render(editorWith([rect]), moved)
    expect(html).toContain('Snap back')
    expect(html).toContain('left:40px;top:100px;width:300px;height:400px')
  })
})

describe('StylePanelToggle', () => {
  test('shows whether the panel is open', () => {
    const closed = createStore<PanelLayout>({ open: false, place: null })
    expect(renderToStaticMarkup(<StylePanelToggle panel={closed} />)).toContain(
      'aria-pressed="false"',
    )
    expect(
      renderToStaticMarkup(<StylePanelToggle panel={openPanel()} />),
    ).toContain('aria-pressed="true"')
  })
})

describe('StylePanel arrowheads (ADR 0055)', () => {
  const arrow = createLinear(
    'arrow',
    lineFromDrag([300, 300], [400, 350], false),
  )

  test('an arrow has a section per end, before opacity, showing its head', () => {
    const html = render(editorWith([arrow]))
    const titles = sections(html)
    expect(titles).toContain('Start arrowhead')
    expect(titles).toContain('End arrowhead')
    expect(titles.indexOf('End arrowhead')).toBeLessThan(
      titles.indexOf('Opacity'),
    )
    expect(html).toContain('Arrow</span>')
  })

  test('other elements and the defaults have no arrowhead section', () => {
    expect(sections(render(editorWith([rect])))).not.toContain('End arrowhead')
    expect(sections(render(editorWith([rect], [])))).not.toContain(
      'End arrowhead',
    )
  })

  test('bar and panel agree after a change', () => {
    const editor = editorWith([arrow])
    editor.setArrowhead('end', 'cardinality_zero_or_many')
    expect(render(editor)).toContain('Zero or many')
    expect(renderToStaticMarkup(<StyleBar editor={editor} />)).toContain(
      'End head: Zero or many',
    )
  })
})
