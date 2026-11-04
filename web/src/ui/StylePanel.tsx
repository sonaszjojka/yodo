import {
  ArrowCounterClockwise,
  LineSegment,
  Palette,
  Scribble,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import type {
  FillStyle,
  StrokeStyle,
  TextAlign,
} from '../core/document/types.ts'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { selectedOf } from '../core/editor/selection.ts'
import {
  commonStyle,
  type CommonStyle,
  type StyleKey,
  type StylePatch,
} from '../core/editor/style.ts'
import type { Bounds } from '../core/geometry/rect.ts'
import type { Store } from '../core/store/store.ts'
import { FONT_STACKS } from '../core/text/layout.ts'
import type { PanelLayout } from '../storage/preferences.ts'
import {
  clampPlace,
  defaultPlace,
  dragPlace,
  resizePlace,
  type ResizeEdge,
} from './panelGeometry.ts'
import { Swatch, WidthLine } from './StyleBar.tsx'
import {
  ALIGNMENTS,
  FILL_STYLES,
  FILLS,
  FONTS,
  labelOf,
  LOOKS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SIZES,
  STROKE_STYLES,
  STROKES,
  WIDTHS,
  type Option,
} from './styleOptions.ts'
import { useStore } from './useStore.ts'
import { useWindowSize } from './useWindowSize.ts'

/** A section of option buttons: its options and how one looks. */
interface Choice<K extends StyleKey> {
  key: K
  name: string
  options: Option<NonNullable<StylePatch[K]>>[]
  show(value: NonNullable<StylePatch[K]>): ReactNode
  /** Option buttons show their label next to the preview. */
  labelled?: boolean
}

function DashLine({ value }: { value: StrokeStyle }) {
  const dash = { solid: undefined, dashed: '5 4', dotted: '1 4' }[value]
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <line
        x1="3"
        y1="11"
        x2="19"
        y2="11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  )
}

function FillPattern({ value }: { value: FillStyle }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect
        x="3"
        y="3"
        width="16"
        height="16"
        rx="3"
        fill={value === 'solid' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {value !== 'solid' && (
        <path
          d={
            value === 'hachure'
              ? 'M3 11 11 3M3 19 19 3M11 19 19 11'
              : 'M3 11 11 3M3 19 19 3M11 19 19 11M3 11l8 8M3 3l16 16M11 3l8 8'
          }
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  )
}

const ALIGN_ICONS: Record<TextAlign, ReactNode> = {
  left: <TextAlignLeft size={20} aria-hidden />,
  center: <TextAlignCenter size={20} aria-hidden />,
  right: <TextAlignRight size={20} aria-hidden />,
}

const CHOICES = {
  strokeColor: {
    key: 'strokeColor',
    name: 'Stroke',
    options: STROKES,
    show: (value) => <Swatch value={value} round />,
  } satisfies Choice<'strokeColor'>,
  backgroundColor: {
    key: 'backgroundColor',
    name: 'Background',
    options: FILLS,
    show: (value) => <Swatch value={value} />,
  } satisfies Choice<'backgroundColor'>,
  fillStyle: {
    key: 'fillStyle',
    name: 'Fill style',
    options: FILL_STYLES,
    show: (value) => <FillPattern value={value} />,
  } satisfies Choice<'fillStyle'>,
  strokeWidth: {
    key: 'strokeWidth',
    name: 'Stroke width',
    options: WIDTHS,
    show: (value) => <WidthLine value={value} />,
  } satisfies Choice<'strokeWidth'>,
  strokeStyle: {
    key: 'strokeStyle',
    name: 'Stroke style',
    options: STROKE_STYLES,
    show: (value) => <DashLine value={value} />,
  } satisfies Choice<'strokeStyle'>,
  roughness: {
    key: 'roughness',
    name: 'Look',
    options: LOOKS,
    labelled: true,
    show: (value) =>
      value === 0 ? (
        <LineSegment size={20} aria-hidden />
      ) : (
        <Scribble size={20} aria-hidden />
      ),
  } satisfies Choice<'roughness'>,
  // Live previews: each font's name is drawn in that font.
  fontFamily: {
    key: 'fontFamily',
    name: 'Font',
    options: FONTS,
    show: (value) => (
      <span
        className="panel-font"
        style={{ fontFamily: FONT_STACKS[value] }}
        aria-hidden
      >
        {labelOf(FONTS, value)}
      </span>
    ),
  } satisfies Choice<'fontFamily'>,
  fontSize: {
    key: 'fontSize',
    name: 'Size',
    options: SIZES,
    show: (value) => (
      <span className="style-text" aria-hidden>
        {labelOf(SIZES, value)}
      </span>
    ),
  } satisfies Choice<'fontSize'>,
  textAlign: {
    key: 'textAlign',
    name: 'Alignment',
    options: ALIGNMENTS,
    show: (value) => ALIGN_ICONS[value],
  } satisfies Choice<'textAlign'>,
} as Record<Exclude<StyleKey, 'opacity'>, Choice<StyleKey>>

/** The panel's sections in order (docs/ui.md); each shows when it fits. */
const ORDER: StyleKey[] = [
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'fontFamily',
  'fontSize',
  'textAlign',
  'opacity',
]

/** The header line of a section: its name and the current value. */
function SectionTitle({
  id,
  name,
  value,
}: {
  id: string
  name: string
  value: string
}) {
  return (
    <h3 className="panel-section-title" id={id}>
      {name}
      <span className="panel-section-value">{value}</span>
    </h3>
  )
}

function ChoiceSection({
  choice,
  value,
  onPick,
  children,
}: {
  choice: Choice<StyleKey>
  value: NonNullable<StylePatch[StyleKey]> | 'mixed'
  onPick(value: NonNullable<StylePatch[StyleKey]>): void
  children?: ReactNode
}) {
  const id = `panel-${choice.key}`
  return (
    <section className="panel-section" aria-labelledby={id}>
      <SectionTitle
        id={id}
        name={choice.name}
        value={labelOf(choice.options, value)}
      />
      <div className="panel-options" role="group" aria-labelledby={id}>
        {choice.options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`tool-button${choice.labelled ? ' is-labelled' : ''}`}
            aria-label={option.label}
            title={option.label}
            aria-pressed={option.value === value}
            onClick={() => onPick(option.value)}
          >
            {choice.show(option.value)}
            {choice.labelled && <span>{option.label}</span>}
          </button>
        ))}
      </div>
      {children}
    </section>
  )
}

/** The exact size in px; applies on Enter or when it loses focus. */
function ExactSize({
  value,
  onSet,
}: {
  value: number | 'mixed'
  onSet(size: number): void
}) {
  function apply(input: HTMLInputElement) {
    const size = Math.round(Number(input.value))
    if (input.value.trim() === '' || !Number.isFinite(size)) {
      input.value = value === 'mixed' ? '' : String(value)
      return
    }
    const clamped = Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE)
    input.value = String(clamped)
    if (clamped !== value) onSet(clamped)
  }
  return (
    <label className="panel-exact">
      Exact size
      <input
        // A new value from elsewhere (the bar, undo) resets the field.
        key={String(value)}
        type="number"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        defaultValue={value === 'mixed' ? '' : value}
        placeholder={value === 'mixed' ? 'Mixed' : undefined}
        onBlur={(event) => apply(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply(event.currentTarget)
        }}
      />
      px
    </label>
  )
}

/**
 * Opacity as a slider. Moving it only updates the number shown; the change
 * applies on release (the native `change` event), so a drag is one undo step.
 */
function OpacitySection({
  value,
  onSet,
}: {
  value: number | 'mixed'
  onSet(opacity: number): void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  // The latest callback, read by the native listener below.
  const onSetRef = useRef(onSet)
  useEffect(() => {
    onSetRef.current = onSet
  })

  useEffect(() => {
    const input = ref.current
    if (!input) return
    function onChange() {
      setDraft(null)
      onSetRef.current(Number(input!.value))
    }
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  const shown = draft ?? (value === 'mixed' ? 100 : value)
  const id = 'panel-opacity'
  return (
    <section className="panel-section" aria-labelledby={id}>
      <SectionTitle
        id={id}
        name="Opacity"
        value={draft === null && value === 'mixed' ? 'Mixed' : `${shown}%`}
      />
      <input
        ref={ref}
        className="panel-range"
        type="range"
        min={0}
        max={100}
        step={10}
        value={shown}
        aria-labelledby={id}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
      />
    </section>
  )
}

const selectTool = (state: EditorState) => state.tool
const selectIds = (state: EditorState) => state.selectedIds
const selectDocument = (state: EditorState) => state.document
const selectDefaults = (state: EditorState) => state.defaults
/** A drag, text edit or erase in progress hides the panel, like the bar. */
const selectBusy = (state: EditorState) =>
  Boolean(
    state.draft ||
    state.move ||
    state.resize ||
    state.marquee ||
    state.editing ||
    state.erasing,
  )
const selectLayout = (layout: PanelLayout) => layout

/** A drag on the header or a resize handle, from where it started. */
interface PanelDrag {
  pointerId: number
  kind: 'move' | ResizeEdge
  startX: number
  startY: number
  start: Bounds
}

export interface StylePanelProps {
  editor: Editor
  /** Open state and place, kept as a preference (ADR 0036). */
  panel: Store<PanelLayout>
}

/**
 * The style panel (docs/ui.md, roadmap 2.2a): every style that fits the
 * selection, or the defaults for new elements when nothing is selected. It
 * edits the same state as the bar, so the two always agree.
 */
export function StylePanel({ editor, panel }: StylePanelProps) {
  const tool = useStore(editor.store, selectTool)
  const ids = useStore(editor.store, selectIds)
  const document = useStore(editor.store, selectDocument)
  const defaults = useStore(editor.store, selectDefaults)
  const busy = useStore(editor.store, selectBusy)
  const layout = useStore(panel, selectLayout)
  const size = useWindowSize()
  // A drag shows here and is stored once, at the end.
  const [live, setLive] = useState<Bounds | null>(null)
  const drag = useRef<PanelDrag | null>(null)

  if (!layout.open || busy) return null

  const place = clampPlace(live ?? layout.place ?? defaultPlace(size), size)
  const selected =
    tool === 'select' ? selectedOf(document.elements, new Set(ids)) : []
  const forDefaults = selected.length === 0
  const style: CommonStyle = forDefaults ? defaults : commonStyle(selected)

  function startDrag(kind: PanelDrag['kind'], event: PointerEvent) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      start: place,
    }
  }

  function moveDrag(event: PointerEvent) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    setLive(
      current.kind === 'move'
        ? dragPlace(current.start, dx, dy, size)
        : resizePlace(current.start, current.kind, dx, dy, size),
    )
  }

  function endDrag(event: PointerEvent) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (live) panel.setState((prev) => ({ ...prev, place: live }))
    setLive(null)
  }

  const dragHandlers = {
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  }

  function onKeyDown(event: KeyboardEvent) {
    // Escape leaves the panel's controls; it doesn't clear the selection.
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (window.document.activeElement instanceof HTMLElement) {
        window.document.activeElement.blur()
      }
    }
  }

  const set = (patch: StylePatch) => editor.setStyle(patch)

  return (
    <div
      className="style-panel"
      role="dialog"
      aria-label="Styles"
      style={{
        left: place.x,
        top: place.y,
        width: place.width,
        height: place.height,
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="panel-header"
        onPointerDown={(event) => {
          // Buttons in the header click; the rest of it drags the panel.
          if ((event.target as Element).closest('button')) return
          startDrag('move', event)
        }}
        {...dragHandlers}
      >
        <h2 className="panel-title">
          {forDefaults ? 'Defaults for new elements' : 'Style'}
        </h2>
        {layout.place && (
          <button
            type="button"
            className="tool-button"
            aria-label="Snap back"
            title="Snap back"
            onClick={() => panel.setState((prev) => ({ ...prev, place: null }))}
          >
            <ArrowCounterClockwise size={18} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="tool-button"
          aria-label="Close styles"
          title="Close"
          onClick={() => panel.setState((prev) => ({ ...prev, open: false }))}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="panel-body">
        {forDefaults && (
          <p className="panel-note">
            Nothing is selected: these apply to what you draw next.
          </p>
        )}
        {ORDER.filter((key) => key in style).map((key) => {
          const value = style[key]!
          if (key === 'opacity') {
            return (
              <OpacitySection
                key={key}
                value={value as number | 'mixed'}
                onSet={(opacity) => set({ opacity })}
              />
            )
          }
          const choice = CHOICES[key]
          return (
            <ChoiceSection
              key={key}
              choice={choice}
              value={value}
              onPick={(picked) => set({ [key]: picked })}
            >
              {key === 'fontSize' && (
                <ExactSize
                  value={value as number | 'mixed'}
                  onSet={(fontSize) => set({ fontSize })}
                />
              )}
            </ChoiceSection>
          )
        })}
        {!forDefaults && (
          <button
            type="button"
            className="button panel-delete"
            onClick={() => editor.deleteSelected()}
          >
            <Trash size={18} aria-hidden />
            Delete
          </button>
        )}
      </div>
      <div
        className="panel-resize-left"
        aria-hidden
        onPointerDown={(event) => startDrag('left', event)}
        {...dragHandlers}
      />
      <div
        className="panel-resize-corner"
        aria-hidden
        onPointerDown={(event) => startDrag('corner', event)}
        {...dragHandlers}
      />
    </div>
  )
}

const selectOpen = (layout: PanelLayout) => layout.open

/** The top-right toggle for the style panel (docs/ui.md, Editor). */
export function StylePanelToggle({ panel }: { panel: Store<PanelLayout> }) {
  const open = useStore(panel, selectOpen)
  return (
    <button
      type="button"
      className="button panel-toggle"
      aria-pressed={open}
      onClick={() => panel.setState((prev) => ({ ...prev, open: !prev.open }))}
    >
      <Palette size={18} aria-hidden />
      Styles
    </button>
  )
}
