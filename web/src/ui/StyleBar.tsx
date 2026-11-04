import { LineSegment, Scribble } from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { selectedOf } from '../core/editor/selection.ts'
import {
  commonStyle,
  type StyleKey,
  type StylePatch,
} from '../core/editor/style.ts'
import { selectionFrame } from '../core/geometry/frame.ts'
import { worldToScreen } from '../core/geometry/viewport.ts'
import { FONT_STACKS } from '../core/text/layout.ts'
import {
  BUTTON,
  barPosition,
  barWidth,
  popoverOffset,
  type Size,
} from './barPosition.ts'
import { isOutside } from './outsidePress.ts'
import {
  FILLS,
  FONTS,
  labelOf,
  LOOKS,
  SIZES,
  STROKES,
  WIDTHS,
  type Option,
} from './styleOptions.ts'
import { useStore } from './useStore.ts'

// The window size as an external store: re-renders on resize, and has a
// fixed size when rendering without a window (tests).
let windowSize: Size = { width: 1024, height: 768 }
function readWindowSize(): Size {
  const { innerWidth: width, innerHeight: height } = window
  if (width !== windowSize.width || height !== windowSize.height) {
    windowSize = { width, height }
  }
  return windowSize
}
function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}
function useWindowSize() {
  return useSyncExternalStore(subscribeResize, readWindowSize, () => windowSize)
}

/** One control of the bar: its options and how a value looks on a button. */
interface Control<K extends StyleKey> {
  key: K
  name: string
  options: Option<NonNullable<StylePatch[K]>>[]
  show(value: NonNullable<StylePatch[K]> | 'mixed'): ReactNode
}

function Swatch({ value, round }: { value: string; round?: boolean }) {
  const kind =
    value === 'mixed' ? ' is-mixed' : value === 'transparent' ? ' is-none' : ''
  return (
    <span
      className={`style-swatch${round ? ' is-round' : ''}${kind}`}
      style={kind ? undefined : { background: value }}
      aria-hidden
    />
  )
}

function WidthLine({ value }: { value: number | 'mixed' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <line
        x1="3"
        y1="11"
        x2="19"
        y2="11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={value === 'mixed' ? 2 : value + 1}
        strokeDasharray={value === 'mixed' ? '2 3' : undefined}
      />
    </svg>
  )
}

const CONTROLS = [
  {
    key: 'strokeColor',
    name: 'Stroke',
    options: STROKES,
    show: (value) => <Swatch value={value} round />,
  } satisfies Control<'strokeColor'>,
  {
    key: 'backgroundColor',
    name: 'Fill',
    options: FILLS,
    show: (value) => <Swatch value={value} />,
  } satisfies Control<'backgroundColor'>,
  {
    key: 'strokeWidth',
    name: 'Width',
    options: WIDTHS,
    show: (value) => <WidthLine value={value} />,
  } satisfies Control<'strokeWidth'>,
  {
    key: 'roughness',
    name: 'Look',
    options: LOOKS,
    show: (value) =>
      value === 0 ? (
        <LineSegment size={20} aria-hidden />
      ) : (
        // Mixed shows the default (hand-drawn) icon; the label says "Mixed".
        <Scribble size={20} aria-hidden />
      ),
  } satisfies Control<'roughness'>,
  {
    key: 'fontFamily',
    name: 'Font',
    options: FONTS,
    show: (value) => (
      <span
        className="style-text"
        style={
          value === 'mixed' ? undefined : { fontFamily: FONT_STACKS[value] }
        }
        aria-hidden
      >
        Aa
      </span>
    ),
  } satisfies Control<'fontFamily'>,
  {
    key: 'fontSize',
    name: 'Size',
    options: SIZES,
    show: (value) => (
      <span className="style-text" aria-hidden>
        {value === 'mixed' ? '–' : labelOf(SIZES, value)}
      </span>
    ),
  } satisfies Control<'fontSize'>,
] as Control<StyleKey>[]

const selectTool = (state: EditorState) => state.tool
const selectIds = (state: EditorState) => state.selectedIds
const selectDocument = (state: EditorState) => state.document
const selectViewport = (state: EditorState) => state.viewport
/** A drag, text edit or erase in progress hides the bar. */
const selectBusy = (state: EditorState) =>
  Boolean(
    state.draft ||
    state.move ||
    state.resize ||
    state.marquee ||
    state.editing ||
    state.erasing,
  )

/**
 * The contextual style bar above the selection (docs/ui.md, roadmap 2.1):
 * each control that fits a selected element, one popover open at a time.
 */
export function StyleBar({ editor }: { editor: Editor }) {
  const tool = useStore(editor.store, selectTool)
  const ids = useStore(editor.store, selectIds)
  const document = useStore(editor.store, selectDocument)
  const viewport = useStore(editor.store, selectViewport)
  const busy = useStore(editor.store, selectBusy)
  const size = useWindowSize()
  // The open popover belongs to one selection: a new selection closes it.
  const [open, setOpen] = useState<{ key: StyleKey; ids: string[] } | null>(
    null,
  )
  const openKey = open?.ids === ids ? open.key : null
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    function onPointerDown(event: PointerEvent) {
      if (isOutside(event.target, ref.current)) setOpen(null)
    }
    window.document.addEventListener('pointerdown', onPointerDown)
    return () =>
      window.document.removeEventListener('pointerdown', onPointerDown)
  }, [openKey])

  if (tool !== 'select' || busy || ids.length === 0) return null
  const selected = selectedOf(document.elements, new Set(ids))
  const frame = selectionFrame(selected, 1 / viewport.zoom)
  if (!frame) return null
  const style = commonStyle(selected)
  const controls = CONTROLS.filter(({ key }) => key in style)

  const { outline } = frame
  const [x, y] = worldToScreen(viewport, [outline.x, outline.y])
  const screenOutline = {
    x,
    y,
    width: outline.width * viewport.zoom,
    height: outline.height * viewport.zoom,
  }
  const { left, top } = barPosition(
    screenOutline,
    barWidth(controls.length),
    size,
  )

  function onKeyDown(event: KeyboardEvent) {
    // Escape closes the popover only; the canvas would clear the selection.
    if (event.key === 'Escape' && openKey) {
      event.stopPropagation()
      setOpen(null)
    }
  }

  return (
    <div
      ref={ref}
      className="style-bar"
      role="toolbar"
      aria-label="Style"
      style={{ left, top }}
      onKeyDown={onKeyDown}
    >
      {controls.map((control) => {
        const value = style[control.key]!
        const label = `${control.name}: ${labelOf(control.options, value)}`
        const isOpen = openKey === control.key
        return (
          <div className="style-control" key={control.key}>
            <button
              type="button"
              className="tool-button"
              aria-label={label}
              title={label}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : { key: control.key, ids })}
            >
              {control.show(value)}
            </button>
            {isOpen && (
              <div
                className="style-popover"
                role="group"
                aria-label={control.name}
                // Up to four per row: two looks fit one row, eight colours two.
                style={{
                  ...popoverOffset({ left, top }, control.options.length, size),
                  gridTemplateColumns: `repeat(${Math.min(4, control.options.length)}, ${BUTTON}px)`,
                }}
              >
                {control.options.map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    className="tool-button"
                    aria-label={option.label}
                    title={option.label}
                    aria-pressed={option.value === value}
                    onClick={() =>
                      editor.setStyle({ [control.key]: option.value })
                    }
                  >
                    {control.show(option.value)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
