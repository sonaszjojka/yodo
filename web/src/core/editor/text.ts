// Pure helpers for editing text (ADR 0026, 0027): what a click edits, what a
// commit does to the document, and where the editing textarea goes.
import { createText, DEFAULT_LABEL } from '../document/create.ts'
import type {
  DiamondElement,
  EllipseElement,
  FontFamily,
  Point,
  RectangleElement,
  TextAlign,
  TextElement,
  YodoDocument,
  YodoElement,
} from '../document/types.ts'
import { hitTest } from '../geometry/hit.ts'
import type { Bounds } from '../geometry/rect.ts'
import {
  heightForLabel,
  labelBox,
  layoutText,
  LINE_HEIGHT,
  MIN_LABEL_EMS,
  type Measure,
} from '../text/layout.ts'

/**
 * The text being edited and what it belongs to. `text` is the textarea's
 * current value; the document changes only on commit.
 */
export type TextEdit =
  | { target: 'new'; element: TextElement; text: string }
  | { target: 'text'; id: string; text: string }
  | { target: 'label'; id: string; text: string }

export type LabelledShape = RectangleElement | DiamondElement | EllipseElement

export function isLabelled(element: YodoElement): element is LabelledShape {
  return (
    element.type === 'rectangle' ||
    element.type === 'diamond' ||
    element.type === 'ellipse'
  )
}

/**
 * The text or shape a text click at `point` edits. What the click really hits
 * comes first, so text inside a transparent shape drawn later stays
 * editable; only then does the topmost shape the point falls inside (filled
 * or not) count. Null means a new text.
 */
export function textTargetAt(
  elements: readonly YodoElement[],
  point: Point,
  tolerance: number,
): TextElement | LabelledShape | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (!hitTest(element, point, tolerance)) continue
    if (element.type === 'text' || isLabelled(element)) return element
    // A line or stroke on top: look for a shape around the point instead.
    break
  }
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    // A label counts as a fill for hit-testing, so this finds a click inside.
    if (
      isLabelled(element) &&
      hitTest({ ...element, label: DEFAULT_LABEL }, point, tolerance)
    )
      return element
  }
  return null
}

/** The edit a click on `target` starts, or a new text at `point` with no target. */
export function editFor(
  target: TextElement | LabelledShape | null,
  point: Point,
): TextEdit {
  if (!target) {
    const element = createText(point)
    // Centre the first line on the click, where the caret appears.
    const half = (element.fontSize * LINE_HEIGHT) / 2
    return {
      target: 'new',
      element: { ...element, y: point[1] - half },
      text: '',
    }
  }
  return target.type === 'text'
    ? { target: 'text', id: target.id, text: target.text }
    : { target: 'label', id: target.id, text: target.label?.text ?? '' }
}

function isBlank(text: string) {
  return text.trim() === ''
}

/** A text resized to fit `text`. */
export function withText(
  element: TextElement,
  text: string,
  measure: Measure,
): TextElement {
  const { width, height } = layoutText(
    text,
    element.fontFamily,
    element.fontSize,
    measure,
  )
  return { ...element, text, width, height }
}

/** A shape with its label set to `text`, grown taller if the text needs it. */
function withLabel(
  shape: LabelledShape,
  text: string,
  measure: Measure,
): LabelledShape {
  if (isBlank(text)) {
    const { label: _removed, ...rest } = shape
    return rest
  }
  const label = { ...(shape.label ?? DEFAULT_LABEL), text }
  const { height: textHeight } = layoutText(
    text,
    label.fontFamily,
    label.fontSize,
    measure,
    labelBox(shape, label.fontSize * MIN_LABEL_EMS).width,
  )
  const height = Math.max(shape.height, heightForLabel(shape.type, textHeight))
  return { ...shape, label, height }
}

/**
 * The document after committing `edit`, and the element to select (null when
 * it was dropped or deleted). Returns the same document when nothing changed,
 * so an unchanged edit is not an undo step.
 */
export function commitEdit(
  document: YodoDocument,
  edit: TextEdit,
  measure: Measure,
): { document: YodoDocument; selectId: string | null } {
  const { elements } = document
  if (edit.target === 'new') {
    if (isBlank(edit.text)) return { document, selectId: null }
    const element = withText(edit.element, edit.text, measure)
    return {
      document: { ...document, elements: [...elements, element] },
      selectId: element.id,
    }
  }
  const index = elements.findIndex((element) => element.id === edit.id)
  const current = elements[index]
  // Undo can't run while editing, but stay safe if the target is gone.
  if (!current) return { document, selectId: null }
  if (current.type === 'text' && isBlank(edit.text)) {
    return {
      document: {
        ...document,
        elements: elements.filter((element) => element !== current),
      },
      selectId: null,
    }
  }
  const unchanged =
    current.type === 'text'
      ? current.text === edit.text
      : isLabelled(current) &&
        (current.label?.text ?? '') === (isBlank(edit.text) ? '' : edit.text)
  if (unchanged) return { document, selectId: current.id }
  const updated =
    current.type === 'text'
      ? withText(current, edit.text, measure)
      : isLabelled(current)
        ? withLabel(current, edit.text, measure)
        : current
  const next = [...elements]
  next[index] = updated
  return { document: { ...document, elements: next }, selectId: current.id }
}

/** Where and how the editing textarea shows the text, in world units. */
export interface EditBox extends Bounds {
  fontFamily: FontFamily
  fontSize: number
  textAlign: TextAlign
  color: string
  /** Labels wrap inside their box; free text grows instead. */
  wraps: boolean
}

/** The textarea's box for `edit`, laid out like the canvas will draw it. */
export function editBox(
  document: YodoDocument,
  edit: TextEdit,
  measure: Measure,
): EditBox | null {
  const element =
    edit.target === 'new'
      ? edit.element
      : document.elements.find((candidate) => candidate.id === edit.id)
  if (!element) return null
  if (element.type === 'text') {
    const { fontFamily, fontSize, textAlign } = element
    const layout = layoutText(edit.text, fontFamily, fontSize, measure)
    return {
      x: element.x,
      y: element.y,
      width: layout.width,
      height: layout.height,
      fontFamily,
      fontSize,
      textAlign,
      color: element.strokeColor,
      wraps: false,
    }
  }
  if (!isLabelled(element)) return null
  const { fontFamily, fontSize, textAlign } = element.label ?? DEFAULT_LABEL
  const box = labelBox(element, fontSize * MIN_LABEL_EMS)
  const layout = layoutText(edit.text, fontFamily, fontSize, measure, box.width)
  return {
    x: box.x,
    y: box.y + (box.height - layout.height) / 2,
    width: box.width,
    height: layout.height,
    fontFamily,
    fontSize,
    textAlign,
    color: element.strokeColor,
    wraps: true,
  }
}
