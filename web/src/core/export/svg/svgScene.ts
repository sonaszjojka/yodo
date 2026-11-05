// Builds the SVG of an export (ADR 0043). Mirrors `drawElement` in
// `render/render.ts`: same rough.js seeds and options, same geometry helpers,
// same text layout. Opacity is set on every drawn part, not on a group,
// because the canvas applies `globalAlpha` to each drawing call separately.
import type { RoughGenerator } from 'roughjs/bin/generator'
import type { Drawable } from 'roughjs/bin/core'
import type {
  ImageElement,
  NoteElement,
  PencilElement,
  Point,
  TextAlign,
  YodoElement,
} from '../../document/types.ts'
import { smoothPath } from '../../geometry/freehand.ts'
import { arrowhead } from '../../geometry/line.ts'
import {
  cornerRadius,
  diamondPoints,
  roundedPolygonPath,
  type Bounds,
} from '../../geometry/rect.ts'
import { adaptColor, canvasColor, type Theme } from '../../render/colors.ts'
import {
  alignedX,
  DASHES,
  IMAGE_PLACEHOLDER,
  NOTE_RADIUS,
  NOTE_SHADOW,
  roughOptions,
} from '../../render/render.ts'
import {
  FONT_STACKS,
  labelBox,
  layoutText,
  LINE_HEIGHT,
  MIN_LABEL_EMS,
  type Measure,
} from '../../text/layout.ts'
import { el, serialize, text, type SvgNode } from './svgNode.ts'

export interface SvgOptions {
  theme: Theme
  /** Paint the page colour under the drawing; transparent when false. */
  background: boolean
}

export interface SvgDeps {
  measure: Measure
  generator: Pick<
    RoughGenerator,
    'rectangle' | 'polygon' | 'ellipse' | 'linearPath' | 'path' | 'toPaths'
  >
  /** `@font-face` rules for the embedded fonts (see `fonts.ts`); may be empty. */
  fontCss: string
  /** The image's `data:` URI, or undefined while it is missing (a placeholder is drawn). */
  imageData(fileId: string): string | undefined
}

const SHADOW_ID = 'yodo-note-shadow'

function opacityOf(element: YodoElement) {
  return element.opacity < 100 ? element.opacity / 100 : undefined
}

function dashes(element: YodoElement) {
  return DASHES[element.strokeStyle]?.join(' ')
}

/**
 * A rough.js drawable as paths. rough.js lists the fill first and the outline
 * last, and only the outline takes the element's dash pattern (as on canvas).
 */
function drawablePaths(
  drawable: Drawable,
  deps: SvgDeps,
  element: YodoElement,
): SvgNode[] {
  const paths = deps.generator.toPaths(drawable)
  return paths.map((path, i) =>
    el('path', {
      d: path.d,
      fill: path.fill ?? 'none',
      stroke: path.stroke,
      'stroke-width': path.strokeWidth,
      'stroke-dasharray': i === paths.length - 1 ? dashes(element) : undefined,
      opacity: opacityOf(element),
    }),
  )
}

const ANCHORS: Record<TextAlign, string> = {
  left: 'start',
  center: 'middle',
  right: 'end',
}

/** Lines of text, each centred in its line box (as `drawLines` on canvas). */
function textLines(
  lines: readonly string[],
  style: {
    family: keyof typeof FONT_STACKS
    size: number
    align: TextAlign
    color: string
    opacity: number | undefined
  },
  box: { left: number; top: number; width: number },
): SvgNode[] {
  const lineHeight = style.size * LINE_HEIGHT
  const x = alignedX(style.align, box.left, box.width)
  return lines.flatMap((line, i) =>
    line === ''
      ? []
      : [
          el(
            'text',
            {
              x,
              y: box.top + (i + 0.5) * lineHeight,
              'text-anchor': ANCHORS[style.align],
              'dominant-baseline': 'central',
              'font-family': FONT_STACKS[style.family],
              'font-size': style.size,
              fill: style.color,
              opacity: style.opacity,
              style: 'white-space:pre',
              'xml:space': 'preserve',
            },
            [text(line)],
          ),
        ],
  )
}

function labelNodes(
  shape: Extract<
    YodoElement,
    { type: 'rectangle' | 'diamond' | 'ellipse' | 'note' }
  >,
  deps: SvgDeps,
  theme: Theme,
): SvgNode[] {
  const { label } = shape
  if (!label?.text) return []
  const box = labelBox(shape, label.fontSize * MIN_LABEL_EMS)
  const layout = layoutText(
    label.text,
    label.fontFamily,
    label.fontSize,
    deps.measure,
    box.width,
  )
  return textLines(
    layout.lines,
    {
      family: label.fontFamily,
      size: label.fontSize,
      align: label.textAlign,
      color: adaptColor(shape.strokeColor, theme, 'stroke'),
      opacity: opacityOf(shape),
    },
    {
      left: box.x,
      top: box.y + (box.height - layout.height) / 2,
      width: box.width,
    },
  )
}

function pencilNode(element: PencilElement, theme: Theme): SvgNode[] {
  const path = smoothPath(
    element.points.map(([dx, dy]): Point => [element.x + dx, element.y + dy]),
  )
  if (path.length === 0) return []
  const d = path
    .map((step) =>
      step.type === 'move'
        ? `M${step.to[0]} ${step.to[1]}`
        : step.type === 'line'
          ? `L${step.to[0]} ${step.to[1]}`
          : `Q${step.control[0]} ${step.control[1]} ${step.to[0]} ${step.to[1]}`,
    )
    .join('')
  return [
    el('path', {
      d,
      fill: 'none',
      stroke: adaptColor(element.strokeColor, theme, 'stroke'),
      'stroke-width': element.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': dashes(element),
      opacity: opacityOf(element),
    }),
  ]
}

function noteNodes(note: NoteElement, deps: SvgDeps, theme: Theme): SvgNode[] {
  return [
    el('rect', {
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      rx: NOTE_RADIUS,
      fill: adaptColor(note.backgroundColor, theme, 'fill'),
      filter: `url(#${SHADOW_ID})`,
      opacity: opacityOf(note),
    }),
    ...labelNodes(note, deps, theme),
  ]
}

function imageNodes(
  image: ImageElement,
  deps: SvgDeps,
  theme: Theme,
): SvgNode[] {
  const { x, y, width, height } = image
  const data = deps.imageData(image.fileId)
  if (data) {
    return [
      el('image', {
        href: data,
        x,
        y,
        width,
        height,
        preserveAspectRatio: 'none',
        opacity: opacityOf(image),
      }),
    ]
  }
  const colors = IMAGE_PLACEHOLDER[theme]
  return [
    el('rect', {
      x,
      y,
      width,
      height,
      fill: colors.fill,
      stroke: colors.line,
      'stroke-width': 1,
      opacity: opacityOf(image),
    }),
  ]
}

function elementNodes(
  element: YodoElement,
  deps: SvgDeps,
  theme: Theme,
): SvgNode[] {
  const options = roughOptions(element, theme)
  const { generator } = deps
  const { x, y, width, height } = element
  switch (element.type) {
    case 'rectangle': {
      const drawable =
        element.roundness === 'round'
          ? generator.path(
              roundedPolygonPath(
                [
                  [x, y],
                  [x + width, y],
                  [x + width, y + height],
                  [x, y + height],
                ],
                cornerRadius(element),
              ),
              options,
            )
          : generator.rectangle(x, y, width, height, options)
      return [
        ...drawablePaths(drawable, deps, element),
        ...labelNodes(element, deps, theme),
      ]
    }
    case 'diamond': {
      const drawable =
        element.roundness === 'round'
          ? generator.path(
              roundedPolygonPath(diamondPoints(element), cornerRadius(element)),
              options,
            )
          : generator.polygon(diamondPoints(element), options)
      return [
        ...drawablePaths(drawable, deps, element),
        ...labelNodes(element, deps, theme),
      ]
    }
    case 'ellipse':
      return [
        ...drawablePaths(
          generator.ellipse(
            x + width / 2,
            y + height / 2,
            width,
            height,
            options,
          ),
          deps,
          element,
        ),
        ...labelNodes(element, deps, theme),
      ]
    case 'note':
      return noteNodes(element, deps, theme)
    case 'image':
      return imageNodes(element, deps, theme)
    case 'line':
    case 'arrow': {
      const points = element.points.map(([dx, dy]): Point => [x + dx, y + dy])
      const nodes = drawablePaths(
        generator.linearPath(points, options),
        deps,
        element,
      )
      const [from, to] = points.slice(-2)
      if (!from || !to) return nodes
      const hasLength = from[0] !== to[0] || from[1] !== to[1]
      if (element.type === 'arrow' && element.endArrowhead && hasLength) {
        nodes.push(
          ...drawablePaths(
            generator.linearPath(arrowhead(from, to), options),
            deps,
            element,
          ),
        )
      }
      return nodes
    }
    case 'pencil':
      return pencilNode(element, theme)
    case 'text':
      return textLines(
        element.text.split('\n'),
        {
          family: element.fontFamily,
          size: element.fontSize,
          align: element.textAlign,
          color: adaptColor(element.strokeColor, theme, 'stroke'),
          opacity: opacityOf(element),
        },
        { left: x, top: y, width },
      )
  }
}

/** The SVG document as a node tree; `buildSvg` is its text. */
export function buildSvgTree(
  elements: readonly YodoElement[],
  frame: Bounds,
  options: SvgOptions,
  deps: SvgDeps,
): SvgNode {
  const defs: SvgNode[] = []
  if (deps.fontCss) defs.push(el('style', {}, [text(deps.fontCss)]))
  if (elements.some((element) => element.type === 'note')) {
    defs.push(
      el(
        'filter',
        { id: SHADOW_ID, x: '-50%', y: '-50%', width: '200%', height: '200%' },
        [
          el('feDropShadow', {
            dx: 0,
            dy: NOTE_SHADOW.offsetY,
            stdDeviation: NOTE_SHADOW.blur / 2,
            'flood-color': '#000000',
            'flood-opacity': 0.22,
          }),
        ],
      ),
    )
  }
  const body = elements.flatMap((element) =>
    elementNodes(element, deps, options.theme),
  )
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: frame.width,
      height: frame.height,
      viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
    },
    [
      ...(defs.length > 0 ? [el('defs', {}, defs)] : []),
      ...(options.background
        ? [
            el('rect', {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              fill: canvasColor(options.theme),
            }),
          ]
        : []),
      ...body,
    ],
  )
}

/** The SVG file for `elements` drawn into `frame` (world units, 1 unit = 1 px). */
export function buildSvg(
  elements: readonly YodoElement[],
  frame: Bounds,
  options: SvgOptions,
  deps: SvgDeps,
): string {
  const tree = buildSvgTree(elements, frame, options, deps)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(tree)}\n`
}
