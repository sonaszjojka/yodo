import rough from 'roughjs'
import { describe, expect, test } from 'vitest'
import {
  createImage,
  createLinear,
  createNote,
  createPencil,
  createShape,
  createText,
  DEFAULT_LABEL,
} from '../../document/create.ts'
import type { YodoElement } from '../../document/types.ts'
import { DARK_CANVAS, LIGHT_CANVAS } from '../../render/colors.ts'
import { roughOptions } from '../../render/render.ts'
import type { Measure } from '../../text/layout.ts'
import { exportFrame } from '../exportScene.ts'
import {
  buildSvg,
  buildSvgTree,
  type SvgDeps,
  type SvgOptions,
} from './svgScene.ts'
import type { SvgNode } from './svgNode.ts'

// Every character is 10 px wide, whatever the font.
const measure: Measure = (value) => value.length * 10
const generator = rough.generator()
const deps: SvgDeps = {
  measure,
  generator,
  fontCss: '',
  imageData: () => undefined,
}
const light: SvgOptions = { theme: 'light', background: true }

type Tag = Extract<SvgNode, { tag: string }>

function treeOf(
  elements: YodoElement[],
  options: Partial<SvgOptions> = {},
  extra: Partial<SvgDeps> = {},
) {
  const frame = exportFrame(elements, measure)!
  return buildSvgTree(
    elements,
    frame,
    { ...light, ...options },
    { ...deps, ...extra },
  )
}

/** Every descendant element with this tag, in document order. */
function all(node: SvgNode, tag: string): Tag[] {
  if ('text' in node) return []
  return [
    ...(node.tag === tag ? [node] : []),
    ...node.children.flatMap((child) => all(child, tag)),
  ]
}

/** The text inside a node. */
function content(node: SvgNode): string {
  return 'text' in node ? node.text : node.children.map(content).join('')
}

const rect = createShape(
  'rectangle',
  { x: 10, y: 20, width: 100, height: 50 },
  7,
)
const label = (text: string, extra = {}) => ({
  ...DEFAULT_LABEL,
  text,
  ...extra,
})

describe('document', () => {
  test('is an SVG sized and framed like the PNG export', () => {
    const svg = treeOf([rect]) as Tag
    expect(svg.tag).toBe('svg')
    expect(svg.attrs.xmlns).toBe('http://www.w3.org/2000/svg')
    expect(svg.attrs.viewBox).toBe('-6 4 132 82')
    expect(svg.attrs.width).toBe(132)
    expect(svg.attrs.height).toBe(82)
  })

  test('the file starts with the XML declaration and ends with a newline', () => {
    const frame = exportFrame([rect], measure)!
    const file = buildSvg([rect], frame, light, deps)
    expect(
      file.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg '),
    ).toBe(true)
    expect(file.endsWith('</svg>\n')).toBe(true)
  })

  test('paints the page colour of the theme, or nothing', () => {
    const page = (options: Partial<SvgOptions>) =>
      (treeOf([rect], options) as Tag).children
        .filter((child) => 'tag' in child && child.tag === 'rect')
        .map((child) => (child as Tag).attrs.fill)
    expect(page({})).toEqual([LIGHT_CANVAS])
    expect(page({ theme: 'dark' })).toEqual([DARK_CANVAS])
    expect(page({ background: false })).toEqual([])
  })

  test('draws elements in document order', () => {
    const line = createLinear(
      'line',
      {
        x: 0,
        y: 0,
        width: 50,
        height: 0,
        points: [
          [0, 0],
          [50, 0],
        ],
      },
      9,
    )
    const text = {
      ...createText([0, 100], 1),
      text: 'late',
      width: 40,
      height: 25,
    }
    const tree = treeOf([text, line], { background: false }) as Tag
    expect(
      tree.children.map((child) => ('tag' in child ? child.tag : '?'))[0],
    ).toBe('text')
  })
})

describe('rough shapes', () => {
  test('uses the same seed and options as the canvas, so the wobble matches', () => {
    const expected = generator.toPaths(
      generator.rectangle(10, 20, 100, 50, roughOptions(rect, 'light')),
    )
    const paths = all(treeOf([rect], { background: false }), 'path')
    expect(paths.map((p) => p.attrs.d)).toEqual(expected.map((p) => p.d))
    expect(paths.at(-1)!.attrs.stroke).toBe(expected.at(-1)!.stroke)
  })

  test('is stable between two exports of the same drawing', () => {
    const frame = exportFrame([rect], measure)!
    expect(buildSvg([rect], frame, light, deps)).toBe(
      buildSvg([rect], frame, light, deps),
    )
  })

  test('adapts colours to the dark theme', () => {
    const dark = all(treeOf([rect], { theme: 'dark' }), 'path')[0]!
    const bright = all(treeOf([rect]), 'path')[0]!
    expect(dark.attrs.stroke).not.toBe(bright.attrs.stroke)
  })

  test('dashes only the outline, not the fill', () => {
    const dashed = {
      ...rect,
      strokeStyle: 'dashed' as const,
      backgroundColor: '#ffc9c9',
      fillStyle: 'hachure' as const,
    }
    const paths = all(treeOf([dashed]), 'path')
    expect(paths.length).toBeGreaterThan(1)
    expect(paths.map((p) => p.attrs['stroke-dasharray'])).toEqual([
      ...paths.slice(0, -1).map(() => undefined),
      '8 8',
    ])
  })

  test('a solid fill is a filled path without a stroke', () => {
    const solid = {
      ...rect,
      backgroundColor: '#ffc9c9',
      fillStyle: 'solid' as const,
    }
    const [fill] = all(treeOf([solid]), 'path')
    expect(fill!.attrs.fill).not.toBe('none')
    expect(fill!.attrs.stroke).toBe('none')
  })

  test.each([
    ['rounded rectangle', { ...rect, roundness: 'round' as const }],
    [
      'diamond',
      createShape('diamond', { x: 0, y: 0, width: 80, height: 60 }, 5),
    ],
    [
      'rounded diamond',
      {
        ...createShape('diamond', { x: 0, y: 0, width: 80, height: 60 }, 5),
        roundness: 'round' as const,
      },
    ],
    [
      'ellipse',
      createShape('ellipse', { x: 0, y: 0, width: 80, height: 60 }, 5),
    ],
  ])('draws a %s', (_name, element) => {
    expect(all(treeOf([element]), 'path').length).toBeGreaterThan(0)
  })

  test('an arrow adds a head to its line; a line or a headless arrow does not', () => {
    const geometry = {
      x: 0,
      y: 0,
      width: 80,
      height: 0,
      points: [
        [0, 0],
        [80, 0],
      ] as [number, number][],
    }
    const count = (e: YodoElement) =>
      all(treeOf([e], { background: false }), 'path').length
    const line = createLinear('line', geometry, 4)
    const arrow = createLinear('arrow', geometry, 4)
    expect(count(arrow)).toBeGreaterThan(count(line))
    expect(count({ ...arrow, endArrowhead: null })).toBe(count(line))
  })

  test('a hollow head hides the shaft: an opaque canvas-coloured fill, then the outline at the arrow opacity', () => {
    const hollow = {
      ...createLinear(
        'arrow',
        {
          x: 0,
          y: 0,
          width: 80,
          height: 0,
          points: [
            [0, 0],
            [80, 0],
          ],
        },
        4,
      ),
      endArrowhead: 'circle_outline' as const,
      opacity: 50,
    }
    const paths = all(treeOf([hollow], { background: false }), 'path')
    const mask = paths.find((p) => p.attrs.fill === LIGHT_CANVAS)
    expect(mask).toBeDefined()
    // Opaque, while the shaft and the outline keep the element's opacity.
    expect(mask!.attrs.opacity).toBeUndefined()
    expect(paths.filter((p) => p.attrs.opacity === 0.5).length).toBeGreaterThan(
      1,
    )
  })

  test('a start head and a closed head add drawings (ADR 0055)', () => {
    const geometry = {
      x: 0,
      y: 0,
      width: 80,
      height: 0,
      points: [
        [0, 0],
        [80, 0],
      ] as [number, number][],
    }
    const count = (e: YodoElement) =>
      all(treeOf([e], { background: false }), 'path').length
    const base = { ...createLinear('arrow', geometry, 4), endArrowhead: null }
    const none = count(base)
    expect(count({ ...base, startArrowhead: 'arrow' })).toBeGreaterThan(none)
    expect(count({ ...base, endArrowhead: 'triangle' })).toBeGreaterThan(none)
    expect(count({ ...base, endArrowhead: 'circle' })).toBeGreaterThan(none)
    expect(
      count({
        ...base,
        startArrowhead: 'bar',
        endArrowhead: 'diamond_outline',
      }),
    ).toBeGreaterThan(count({ ...base, endArrowhead: 'diamond_outline' }))
  })
})

describe('curved lines and arrows (ADR 0053)', () => {
  const curved = (type: 'line' | 'arrow') => ({
    ...createLinear(
      type,
      {
        x: 0,
        y: 0,
        width: 120,
        height: 60,
        points: [
          [0, 0],
          [60, 60],
          [120, 0],
        ] as [number, number][],
      },
      4,
    ),
    curved: true as const,
    roughness: 0,
  })
  const d = (e: YodoElement) =>
    all(treeOf([e], { background: false }), 'path')[0]!.attrs.d as string

  test('a curved line passes through its middle point and differs from the polyline', () => {
    const straight = { ...curved('line'), curved: undefined }
    expect(d(curved('line'))).toContain('60 60')
    expect(d(curved('line'))).not.toBe(d(straight))
  })

  test('the head of a curved arrow is as big as a straight arrow with the same chord', () => {
    const paths = all(treeOf([curved('arrow')], { background: false }), 'path')
    expect(paths.length).toBeGreaterThan(1)
    const head = paths.at(-1)!.attrs.d as string
    const numbers = head.match(/-?\d+(\.\d+)?/g)!.map(Number)
    // Some wing coordinate lies close to 20 units from the tip (x = 120).
    expect(Math.max(...numbers.map((n) => Math.abs(n)))).toBeGreaterThan(90)
  })
})

describe('pencil', () => {
  test('is a smoothed path with round caps and no wobble', () => {
    const pencil = createPencil(
      {
        x: 5,
        y: 5,
        width: 20,
        height: 10,
        points: [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
      },
      2,
    )
    const [path] = all(treeOf([pencil], { background: false }), 'path')
    expect(path!.attrs.d).toBe('M5 5Q15 15 20 10L25 5')
    expect(path!.attrs.fill).toBe('none')
    expect(path!.attrs['stroke-linecap']).toBe('round')
    expect(path!.attrs['stroke-linejoin']).toBe('round')
  })
})

describe('text', () => {
  const free = (value: string, extra = {}): YodoElement => ({
    ...createText([30, 40], 1),
    text: value,
    width: 100,
    height: 25,
    ...extra,
  })
  const texts = (element: YodoElement) =>
    all(treeOf([element], { background: false }), 'text')

  test('draws one <text> per line with the stack, size, anchor and baseline', () => {
    const [first, second] = texts(
      free('one\ntwo', {
        fontFamily: 'mono',
        fontSize: 16,
        textAlign: 'right',
      }),
    )
    expect([first, second].map((t) => content(t!))).toEqual(['one', 'two'])
    expect(first!.attrs['text-anchor']).toBe('end')
    expect(first!.attrs.x).toBe(130)
    expect(first!.attrs['font-size']).toBe(16)
    expect(first!.attrs['font-family']).toContain('JetBrains Mono Variable')
    expect(first!.attrs['dominant-baseline']).toBe('central')
    expect(first!.attrs.y).toBe(50)
    expect(second!.attrs.y).toBe(70)
  })

  test('keeps indentation and repeated spaces', () => {
    const [t] = texts(free('  a  b'))
    expect(content(t!)).toBe('  a  b')
    expect(t!.attrs['xml:space']).toBe('preserve')
    expect(t!.attrs.style).toContain('white-space:pre')
  })

  test('escapes markup in the text', () => {
    const frame = exportFrame([free('<b>&</b>')], measure)!
    const file = buildSvg([free('<b>&</b>')], frame, light, deps)
    expect(file).toContain('&lt;b&gt;&amp;&lt;/b&gt;')
    expect(file).not.toContain('<b>')
  })

  test('skips empty lines but keeps the spacing of the rest', () => {
    const ys = texts(free('a\n\nb')).map((t) => t.attrs.y)
    expect(ys).toEqual([52.5, 102.5])
  })

  test('wraps a shape label to its box and centres it', () => {
    const shape = { ...rect, label: label('aaaa bbbb cccc dddd') }
    const lines = texts(shape)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.map((t) => content(t)).join(' ')).toBe('aaaa bbbb cccc dddd')
    expect(lines[0]!.attrs['text-anchor']).toBe('middle')
  })
})

describe('opacity', () => {
  test('is set on each drawn part, never on a group', () => {
    const faded = { ...rect, opacity: 50, label: label('hi') }
    const tree = treeOf([faded], { background: false })
    expect(all(tree, 'g')).toEqual([])
    const parts = [...all(tree, 'path'), ...all(tree, 'text')]
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.map((p) => p.attrs.opacity)).toEqual(parts.map(() => 0.5))
  })

  test('is left out at 100', () => {
    const parts = all(treeOf([rect], { background: false }), 'path')
    expect(parts.map((p) => p.attrs.opacity)).toEqual(
      parts.map(() => undefined),
    )
  })

  test('a translucent note fades its box and its label each on their own', () => {
    const note = {
      ...createNote({ x: 0, y: 0, width: 100, height: 60 }, 1),
      opacity: 40,
      label: label('hi'),
    }
    const tree = treeOf([note], { background: false })
    expect(all(tree, 'rect')[0]!.attrs.opacity).toBe(0.4)
    expect(all(tree, 'text')[0]!.attrs.opacity).toBe(0.4)
  })
})

describe('notes', () => {
  const note = createNote({ x: 0, y: 0, width: 100, height: 60 }, 1)

  test('is a rounded box with a drop shadow filter', () => {
    const tree = treeOf([note], { background: false })
    const box = all(tree, 'rect')[0]!
    expect(box.attrs.rx).toBe(4)
    expect(box.attrs.filter).toBe('url(#yodo-note-shadow)')
    const [filter] = all(tree, 'filter')
    expect(filter!.attrs.id).toBe('yodo-note-shadow')
    expect(all(filter!, 'feDropShadow')).toHaveLength(1)
  })

  test('adds no filter when there are no notes', () => {
    expect(all(treeOf([rect]), 'filter')).toEqual([])
  })
})

describe('images', () => {
  const view = { x: 0, y: 0, width: 1000, height: 1000 }
  const image = createImage('abc', { width: 40, height: 20 }, view)

  test('embeds the picture as a data URI', () => {
    const tree = treeOf(
      [image],
      {},
      { imageData: () => 'data:image/png;base64,AAAA' },
    )
    const [node] = all(tree, 'image')
    expect(node!.attrs.href).toBe('data:image/png;base64,AAAA')
    expect(node!.attrs.preserveAspectRatio).toBe('none')
  })

  test('draws a grey placeholder when the picture is missing', () => {
    const tree = treeOf([image], { background: false })
    expect(all(tree, 'image')).toEqual([])
    expect(all(tree, 'rect')[0]!.attrs.fill).toBe('#e9ecef')
  })
})

describe('fonts', () => {
  test('puts the font CSS in a <style> inside <defs>, and nothing without it', () => {
    const css = "@font-face{font-family:'X';src:url(data:font/woff2;base64,AA)}"
    const [style] = all(treeOf([rect], {}, { fontCss: css }), 'style')
    expect(content(style!)).toBe(css)
    expect(all(treeOf([rect]), 'style')).toEqual([])
  })
})
