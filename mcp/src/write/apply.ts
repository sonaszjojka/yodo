// The write tools' changes as pure functions over a document (ADR 0066). Each
// builds elements with the editor's own factories and binding code, checks
// every element it creates or changes with validate.ts, and either returns the
// new document or an error that says how to fix the call; never both.

import {
  BUILT_IN_STYLE,
  createLinear,
  createNote,
  createShape,
  createText,
  NOTE_SIZE,
  randomId,
  type ElementStyle,
} from '../../../web/src/core/document/create.ts'
import type {
  ArrowElement,
  Point,
  TextLabel,
  YodoDocument,
  YodoElement,
} from '../../../web/src/core/document/types.ts'
import {
  isElement,
  sanitizeElement,
} from '../../../web/src/core/document/validate.ts'
import {
  followBindings,
  isBindable,
  isPathTarget,
  snapToTarget,
  unbindDeleted,
} from '../../../web/src/core/editor/binding.ts'
import {
  isLabelled,
  withLabel,
  withText,
} from '../../../web/src/core/editor/text.ts'
import type { LinearGeometry } from '../../../web/src/core/geometry/line.ts'
import { elementBounds } from '../../../web/src/core/geometry/rect.ts'
import type { Measure } from '../../../web/src/core/text/layout.ts'
import type { ConnectionSpec, ElementPatch, NewElementSpec } from './spec.ts'

export type Applied = { doc: YodoDocument; ids: string[] } | { error: string }

class SpecError extends Error {}

/** Runs `body`, turning a SpecError into the call's error result. */
function attempt(body: () => Applied): Applied {
  try {
    return body()
  } catch (error) {
    if (error instanceof SpecError) return { error: error.message }
    throw error
  }
}

const quote = JSON.stringify

/** The geometry of absolute world points, stored relative to the first. */
function geometryOf(points: readonly Point[]): LinearGeometry {
  const [x, y] = points[0]!
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return {
    x,
    y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: points.map(([px, py]): Point => [px - x, py - y]),
  }
}

function absolutePoints(element: { x: number; y: number; points: Point[] }) {
  return element.points.map(([dx, dy]): Point => [
    element.x + dx,
    element.y + dy,
  ])
}

/** The spec's style fields over the built-in style. */
function styleOf(spec: Partial<ElementStyle>): ElementStyle {
  const style: ElementStyle = { ...BUILT_IN_STYLE }
  for (const key of Object.keys(style) as (keyof ElementStyle)[]) {
    if (spec[key] !== undefined) {
      ;(style as Record<string, unknown>)[key] = spec[key]
    }
  }
  return style
}

/** Ids already in `elements`, plus a check that reserves a new one. */
function idChecker(elements: readonly YodoElement[]) {
  const used = new Set(elements.map((e) => e.id))
  return (wanted: string | undefined): string => {
    if (wanted === undefined) {
      let id = randomId()
      while (used.has(id)) id = randomId()
      used.add(id)
      return id
    }
    if (used.has(wanted)) {
      throw new SpecError(
        `The id ${quote(wanted)} is already used in this drawing or call. Pick another, or leave id out.`,
      )
    }
    used.add(wanted)
    return wanted
  }
}

/** A label set with the spec's font, aligned as asked (default centre). */
function labelled<T extends YodoElement>(
  shape: T,
  text: string | undefined,
  font: Partial<Pick<TextLabel, 'fontFamily' | 'fontSize' | 'textAlign'>>,
  measure: Measure,
): T {
  if (text === undefined || !isLabelled(shape)) return shape
  const style = styleOf({
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
  })
  const next = withLabel(shape, text, measure, style)
  return (next.label
    ? {
        ...next,
        label: { ...next.label, textAlign: font.textAlign ?? 'center' },
      }
    : next) as unknown as T
}

function build(
  spec: NewElementSpec,
  id: string,
  measure: Measure,
): YodoElement {
  switch (spec.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse': {
      const { x, y, width, height } = spec
      const shape = {
        ...createShape(
          spec.type,
          { x, y, width, height },
          undefined,
          styleOf(spec),
        ),
        id,
      }
      return labelled(shape, spec.label, spec, measure)
    }
    case 'note': {
      const width = spec.width ?? NOTE_SIZE
      const height = spec.height ?? NOTE_SIZE
      const note = {
        ...createNote(
          { x: spec.x, y: spec.y, width, height },
          undefined,
          styleOf(spec),
        ),
        id,
        ...(spec.backgroundColor
          ? { backgroundColor: spec.backgroundColor }
          : {}),
      }
      return labelled(note, spec.label, spec, measure)
    }
    case 'text': {
      const text = {
        ...createText([spec.x, spec.y], undefined, styleOf(spec)),
        id,
      }
      return withText(text, spec.text, measure)
    }
    case 'line':
    case 'arrow': {
      const linear = {
        ...createLinear(
          spec.type,
          geometryOf(spec.points),
          undefined,
          styleOf(spec),
        ),
        id,
        ...(spec.curved ? { curved: true as const } : {}),
      }
      if (linear.type !== 'arrow' || spec.type !== 'arrow') return linear
      return {
        ...linear,
        ...(spec.startArrowhead !== undefined
          ? { startArrowhead: spec.startArrowhead }
          : {}),
        ...(spec.endArrowhead !== undefined
          ? { endArrowhead: spec.endArrowhead }
          : {}),
      }
    }
  }
}

/**
 * Every element in `after` that is new or changed since `before` must be one
 * validate.ts accepts as it is (ADR 0039, 0066): nothing is repaired.
 */
function check(before: readonly YodoElement[], after: readonly YodoElement[]) {
  const old = new Set(before)
  for (const element of after) {
    if (old.has(element)) continue
    if (!isElement(element) || sanitizeElement(element) !== element) {
      throw new SpecError(
        `The element ${quote(element.id)} isn't valid after this change; check its numbers and fields.`,
      )
    }
  }
}

function changed(doc: YodoDocument, elements: YodoElement[], ids: string[]) {
  check(doc.elements, elements)
  return { doc: { ...doc, elements }, ids }
}

/** New elements from `specs`, on top of the drawing, in order. */
export function addElements(
  doc: YodoDocument,
  specs: readonly NewElementSpec[],
  measure: Measure,
): Applied {
  return attempt(() => {
    const reserve = idChecker(doc.elements)
    const created = specs.map((spec) => build(spec, reserve(spec.id), measure))
    return changed(
      doc,
      [...doc.elements, ...created],
      created.map((e) => e.id),
    )
  })
}

const STYLE_FIELDS = [
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'opacity',
  'roundness',
] as const
const FONT_FIELDS = ['fontFamily', 'fontSize', 'textAlign'] as const
const LINE_STYLES = [
  'strokeColor',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'opacity',
] as const
const BOX_STYLES = [
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'opacity',
] as const

/** The patch fields each element type takes (ADR 0066). */
const ALLOWED: Record<YodoElement['type'], readonly string[]> = {
  rectangle: [
    'x',
    'y',
    'width',
    'height',
    'label',
    ...FONT_FIELDS,
    ...BOX_STYLES,
    'roundness',
  ],
  diamond: [
    'x',
    'y',
    'width',
    'height',
    'label',
    ...FONT_FIELDS,
    ...BOX_STYLES,
    'roundness',
  ],
  ellipse: [
    'x',
    'y',
    'width',
    'height',
    'label',
    ...FONT_FIELDS,
    ...BOX_STYLES,
  ],
  // A note has a fixed paper look (ADR 0038): only its colours and opacity.
  note: [
    'x',
    'y',
    'width',
    'height',
    'label',
    ...FONT_FIELDS,
    'strokeColor',
    'backgroundColor',
    'opacity',
  ],
  image: ['x', 'y', 'width', 'height', 'opacity'],
  line: ['x', 'y', 'points', 'curved', ...LINE_STYLES],
  arrow: [
    'x',
    'y',
    'points',
    'curved',
    'startArrowhead',
    'endArrowhead',
    ...LINE_STYLES,
  ],
  pencil: ['x', 'y', 'strokeColor', 'strokeWidth', 'strokeStyle', 'opacity'],
  text: ['x', 'y', 'text', ...FONT_FIELDS, 'strokeColor', 'opacity'],
}

function sameBox(a: YodoElement, b: YodoElement) {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

function samePoint(a: Point, b: Point) {
  return a[0] === b[0] && a[1] === b[1]
}

function withoutKey<T extends object>(value: T, key: string): T {
  const { [key]: _removed, ...rest } = value as Record<string, unknown>
  return rest as T
}

/** One element with `patch` applied; the caller fixes up bindings after. */
function patched(
  element: YodoElement,
  patch: ElementPatch,
  measure: Measure,
): YodoElement {
  const { id, ...fields } = patch
  const given = Object.keys(fields).filter(
    (key) => fields[key as keyof typeof fields] !== undefined,
  )
  const allowed = ALLOWED[element.type]
  const wrong = given.filter((key) => !allowed.includes(key))
  if (wrong.length > 0) {
    throw new SpecError(
      `${quote(id)} is a ${element.type}, which has no ${wrong.join(', ')}. ` +
        `A ${element.type} takes: ${allowed.join(', ')}.`,
    )
  }
  if (element.type === 'note' && patch.backgroundColor === 'transparent') {
    throw new SpecError(
      `${quote(id)} is a note, which can't be transparent (it always has a colour).`,
    )
  }
  if (
    'points' in element &&
    patch.points &&
    (patch.x !== undefined || patch.y !== undefined)
  ) {
    throw new SpecError(
      `Give ${quote(id)} either points (absolute) or x/y (a move), not both.`,
    )
  }
  let next: YodoElement = { ...element }
  const record = next as unknown as Record<string, unknown>
  for (const key of STYLE_FIELDS) {
    if (patch[key] !== undefined) record[key] = patch[key]
  }

  // Geometry: a move keeps a path's points relative to its new origin.
  if (patch.x !== undefined) record.x = patch.x
  if (patch.y !== undefined) record.y = patch.y
  if (patch.width !== undefined) record.width = patch.width
  if (patch.height !== undefined) record.height = patch.height
  if (patch.points && (next.type === 'line' || next.type === 'arrow')) {
    next = { ...next, ...geometryOf(patch.points) }
  }
  if (next.type === 'line' || next.type === 'arrow') {
    if (patch.curved === true) next = { ...next, curved: true }
    if (patch.curved === false) next = withoutKey(next, 'curved')
  }
  if (next.type === 'arrow') {
    if (patch.startArrowhead !== undefined)
      next = { ...next, startArrowhead: patch.startArrowhead }
    if (patch.endArrowhead !== undefined)
      next = { ...next, endArrowhead: patch.endArrowhead }
  }

  if (next.type === 'text') {
    const font = {
      fontFamily: patch.fontFamily ?? next.fontFamily,
      fontSize: patch.fontSize ?? next.fontSize,
      textAlign: patch.textAlign ?? next.textAlign,
    }
    next = withText({ ...next, ...font }, patch.text ?? next.text, measure)
  }

  if (isLabelled(next)) {
    const fontGiven = FONT_FIELDS.some((key) => patch[key] !== undefined)
    if (patch.label === undefined && !fontGiven) return next
    const text = patch.label ?? next.label?.text
    if (text === undefined || (fontGiven && text.trim() === '')) {
      throw new SpecError(
        `${quote(id)} has no label, so its font can't change. Set label too.`,
      )
    }
    const label: TextLabel = {
      ...(next.label ?? {
        text,
        fontFamily: BUILT_IN_STYLE.fontFamily,
        fontSize: BUILT_IN_STYLE.fontSize,
        textAlign: 'center',
      }),
      ...(patch.fontFamily ? { fontFamily: patch.fontFamily } : {}),
      ...(patch.fontSize ? { fontSize: patch.fontSize } : {}),
      ...(patch.textAlign ? { textAlign: patch.textAlign } : {}),
    }
    next = withLabel({ ...next, label }, text, measure, BUILT_IN_STYLE)
  }
  return next
}

/** Changes to existing elements; arrows bound to them follow (ADR 0048, 0054). */
export function updateElements(
  doc: YodoDocument,
  patches: readonly ElementPatch[],
  measure: Measure,
): Applied {
  return attempt(() => {
    const index = new Map(doc.elements.map((e, i) => [e.id, i]))
    const elements = [...doc.elements]
    const moved = new Set<string>()
    const edited = new Set<string>()
    for (const patch of patches) {
      const at = index.get(patch.id)
      if (at === undefined) {
        throw new SpecError(
          `No element with id ${quote(patch.id)} in this drawing. Call get_drawing for its ids.`,
        )
      }
      const before = elements[at]!
      let after = patched(before, patch, measure)
      if ('points' in before && 'points' in after) {
        if (patch.points) {
          edited.add(after.id)
          // An end the agent moved is no longer where its binding says: let
          // it go, as dragging that end off its shape would (ADR 0052).
          if (after.type === 'arrow') {
            const [oldStart, oldEnd] = endsOf(before as ArrowElement)
            const [newStart, newEnd] = endsOf(after)
            if (!samePoint(oldStart, newStart))
              after = withoutKey(after, 'startBinding')
            if (!samePoint(oldEnd, newEnd))
              after = withoutKey(after, 'endBinding')
          }
        } else if (!sameBox(before, after)) {
          moved.add(after.id)
        }
        // A curve draws a different path, so ends attached along it move.
        if (
          (before as { curved?: true }).curved !==
          (after as { curved?: true }).curved
        ) {
          edited.add(after.id)
        }
      } else if (!sameBox(before, after)) {
        moved.add(after.id)
      }
      elements[at] = after
    }
    const followed = followBindings(elements, moved, undefined, edited)
    return changed(
      doc,
      followed,
      patches.map((p) => p.id),
    )
  })
}

function endsOf(arrow: ArrowElement): [Point, Point] {
  const absolute = absolutePoints(arrow)
  return [absolute[0]!, absolute[absolute.length - 1]!]
}

/** The drawing without `ids`; arrows bound to them are detached, not moved. */
export function deleteElements(
  doc: YodoDocument,
  ids: readonly string[],
): Applied {
  return attempt(() => {
    const present = new Set(doc.elements.map((e) => e.id))
    const missing = ids.find((id) => !present.has(id))
    if (missing !== undefined) {
      throw new SpecError(
        `No element with id ${quote(missing)} in this drawing. Call get_drawing for its ids.`,
      )
    }
    const deleted = new Set(ids)
    const kept = doc.elements.filter((e) => !deleted.has(e.id))
    return changed(doc, unbindDeleted(kept, deleted), [...deleted])
  })
}

function centre(element: YodoElement): Point {
  const b = elementBounds(element)
  return [b.x + b.width / 2, b.y + b.height / 2]
}

/**
 * A new arrow for each connection, from one element to the other, with both
 * ends attached where the two face each other (ADR 0048, 0054).
 */
export function connectElements(
  doc: YodoDocument,
  connections: readonly ConnectionSpec[],
): Applied {
  return attempt(() => {
    const elements = [...doc.elements]
    const byId = new Map(elements.map((e) => [e.id, e]))
    const reserve = idChecker(elements)
    const created: string[] = []
    const target = (id: string) => {
      const element = byId.get(id)
      if (!element) {
        throw new SpecError(
          `No element with id ${quote(id)} in this drawing. Call get_drawing for its ids.`,
        )
      }
      if (!isBindable(element) && !isPathTarget(element)) {
        throw new SpecError(
          `An arrow can't attach to a ${element.type} (${quote(id)}): only to a rectangle, diamond, ellipse, note, image, line or arrow.`,
        )
      }
      return element
    }
    for (const spec of connections) {
      if (spec.from === spec.to) {
        throw new SpecError(
          `A connection can't go from ${quote(spec.from)} to itself.`,
        )
      }
      const from = target(spec.from)
      const to = target(spec.to)
      const start = snapToTarget(from, centre(to))
      const end = snapToTarget(to, start.point)
      if (samePoint(start.point, end.point)) {
        throw new SpecError(
          `${quote(spec.from)} and ${quote(spec.to)} overlap, so an arrow between them has no length. Move one of them first.`,
        )
      }
      const id = reserve(spec.id)
      const base = createLinear(
        'arrow',
        geometryOf([start.point, end.point]),
        undefined,
        styleOf(spec),
      )
      const arrow: ArrowElement = {
        ...base,
        id,
        startBinding: start.binding,
        endBinding: end.binding,
        ...(spec.startArrowhead !== undefined
          ? { startArrowhead: spec.startArrowhead }
          : {}),
        ...(spec.endArrowhead !== undefined
          ? { endArrowhead: spec.endArrowhead }
          : {}),
      }
      elements.push(arrow)
      byId.set(id, arrow)
      created.push(id)
    }
    return changed(doc, elements, created)
  })
}
