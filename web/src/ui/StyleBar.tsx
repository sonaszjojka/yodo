import {
  DotsThree,
  LineSegment,
  Scribble,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { Arrowhead } from '../core/document/types.ts'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { commonArrowhead } from '../core/editor/arrowhead.ts'
import { selectedOf } from '../core/editor/selection.ts'
import {
  commonStyle,
  type StyleKey,
  type StylePatch,
} from '../core/editor/style.ts'
import { selectionFrame } from '../core/geometry/frame.ts'
import { worldToScreen } from '../core/geometry/viewport.ts'
import { adaptColor, type ColorRole } from '../core/render/colors.ts'
import { FONT_STACKS } from '../core/text/layout.ts'
import { useTheme } from './useTheme.ts'
import {
  BUTTON,
  barPosition,
  barWidth,
  menuOffset,
  popoverOffset,
} from './barPosition.ts'
import { nextMenuIndex } from './menuKeys.ts'
import { MORE_ITEMS } from './moreItems.tsx'
import { isOutside } from './outsidePress.ts'
import { ArrowheadGlyph } from './ArrowheadGlyph.tsx'
import {
  ARROWHEAD_OPTIONS,
  FILLS,
  fillsFor,
  FONTS,
  labelOf,
  LOOKS,
  SIZES,
  STROKES,
  WIDTHS,
  type Option,
} from './styleOptions.ts'
import { useStore } from './useStore.ts'
import { useWindowSize } from './useWindowSize.ts'

/** One control of the bar: its options and how a value looks on a button. */
interface Control<K extends StyleKey> {
  key: K
  name: string
  options: Option<NonNullable<StylePatch[K]>>[]
  show(value: NonNullable<StylePatch[K]> | 'mixed'): ReactNode
}

/** One control of the bar, whatever it edits: a style, or an arrow's head. */
interface BarItem {
  key: string
  name: string
  options: Option<unknown>[]
  value: unknown
  show(value: unknown): ReactNode
  choose(value: unknown): void
}

/** A colour sample, shown as it looks on the canvas in the current theme. */
export function Swatch({
  value,
  role,
  round,
}: {
  value: string
  role: ColorRole
  round?: boolean
}) {
  const { theme } = useTheme()
  const kind =
    value === 'mixed' ? ' is-mixed' : value === 'transparent' ? ' is-none' : ''
  return (
    <span
      className={`style-swatch${round ? ' is-round' : ''}${kind}`}
      style={kind ? undefined : { background: adaptColor(value, theme, role) }}
      aria-hidden
    />
  )
}

export function WidthLine({ value }: { value: number | 'mixed' }) {
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

/** S/M/L/XL, or the px number for an exact size set in the panel. */
function sizeLabel(value: number) {
  return SIZES.find((option) => option.value === value)?.label ?? String(value)
}

const CONTROLS = [
  {
    key: 'strokeColor',
    name: 'Stroke',
    options: STROKES,
    show: (value) => <Swatch value={value} role="stroke" round />,
  } satisfies Control<'strokeColor'>,
  {
    key: 'backgroundColor',
    name: 'Fill',
    options: FILLS,
    show: (value) => <Swatch value={value} role="fill" />,
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
        {value === 'mixed' ? '–' : sizeLabel(value)}
      </span>
    ),
  } satisfies Control<'fontSize'>,
] as Control<StyleKey>[]

/** Keys the canvas handles on the window; inside the menu they act on its items. */
const MENU_KEYS = new Set([' ', 'Delete', 'Backspace'])

function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
  // Space activates the focused item instead of panning, and Delete or
  // Backspace don't delete the selection behind the menu.
  if (MENU_KEYS.has(event.key)) {
    event.stopPropagation()
    return
  }
  if (event.type !== 'keydown') return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  ]
  const next = nextMenuIndex(
    event.key,
    items.indexOf(window.document.activeElement as HTMLElement),
    items.length,
  )
  if (next === null) return
  event.preventDefault()
  items[next]?.focus()
}

export interface MoreMenuProps {
  editor: Editor
  /** Whether a style has been copied, so "Paste style" can apply. */
  canPaste: boolean
  /** Closes the menu; called before the chosen action runs. */
  onDone(): void
  style?: CSSProperties
}

/**
 * The bar's "more" menu (docs/ui.md, roadmap 2.2b): actions on the
 * selection, each one undo step except copying a style.
 */
export function MoreMenu({ editor, canPaste, onDone, style }: MoreMenuProps) {
  return (
    <div
      className="menu style-menu"
      onKeyDown={onMenuKey}
      onKeyUp={onMenuKey}
      role="menu"
      aria-label="More"
      style={style}
    >
      {MORE_ITEMS.map(({ label, icon, run, disabled }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled?.(canPaste)}
          onClick={() => {
            onDone()
            run(editor)
          }}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}

const selectTool = (state: EditorState) => state.tool
const selectIds = (state: EditorState) => state.selectedIds
const selectDocument = (state: EditorState) => state.document
const selectViewport = (state: EditorState) => state.viewport
const selectCanPaste = (state: EditorState) => state.copiedStyle !== null
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

export interface StyleBarProps {
  editor: Editor
  /** Opens the style panel ("All styles", roadmap 2.2a). */
  onAllStyles?(): void
}

/**
 * The contextual style bar above the selection (docs/ui.md, roadmap 2.1):
 * each control that fits a selected element, one popover open at a time,
 * then "All styles", which opens the style panel.
 */
export function StyleBar({ editor, onAllStyles }: StyleBarProps) {
  const tool = useStore(editor.store, selectTool)
  const ids = useStore(editor.store, selectIds)
  const document = useStore(editor.store, selectDocument)
  const viewport = useStore(editor.store, selectViewport)
  const busy = useStore(editor.store, selectBusy)
  const canPaste = useStore(editor.store, selectCanPaste)
  const size = useWindowSize()
  // The open popover (or the "more" menu) belongs to one selection: a new
  // selection closes it.
  const [open, setOpen] = useState<{
    key: string
    ids: string[]
  } | null>(null)
  const openKey = open?.ids === ids ? open.key : null
  const ref = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!openKey) return
    function onPointerDown(event: PointerEvent) {
      if (isOutside(event.target, ref.current)) setOpen(null)
    }
    window.document.addEventListener('pointerdown', onPointerDown)
    // The menu takes focus, like the Home card menu, so arrows start there.
    if (openKey === 'more') {
      ref.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
        ?.focus()
    }
    return () =>
      window.document.removeEventListener('pointerdown', onPointerDown)
  }, [openKey])

  if (tool !== 'select' || busy || ids.length === 0) return null
  const selected = selectedOf(document.elements, new Set(ids))
  const frame = selectionFrame(selected, 1 / viewport.zoom)
  if (!frame) return null
  const style = commonStyle(selected)
  const fills = fillsFor(selected)
  const items: BarItem[] = CONTROLS.filter(({ key }) => key in style).map(
    (control): BarItem => {
      const options =
        control.key === 'backgroundColor' ? fills : control.options
      return {
        key: control.key,
        name: control.name,
        options,
        value: style[control.key]!,
        show: (value) => control.show(value as never),
        choose: (value) => editor.setStyle({ [control.key]: value }),
      }
    },
  )
  // An arrow in the selection adds a control per end (ADR 0055).
  for (const end of ['start', 'end'] as const) {
    const head = commonArrowhead(selected, end)
    if (head === undefined) continue
    items.push({
      key: `${end}Arrowhead`,
      name: end === 'start' ? 'Start head' : 'End head',
      options: ARROWHEAD_OPTIONS,
      value: head,
      show: (value) => (
        <ArrowheadGlyph head={value as Arrowhead | null | 'mixed'} end={end} />
      ),
      choose: (value) => editor.setArrowhead(end, value as Arrowhead | null),
    })
  }

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
    // The controls, then All styles and More.
    barWidth(items.length + 2),
    size,
  )

  function onKeyDown(event: KeyboardEvent) {
    // Escape closes the popover only; the canvas would clear the selection.
    if (event.key === 'Escape' && openKey) {
      event.stopPropagation()
      closeMenu()
    }
  }

  /** Closes what is open; a closing menu hands focus back to its button. */
  function closeMenu() {
    if (openKey === 'more') moreRef.current?.focus()
    setOpen(null)
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
      {items.map((control, index) => {
        const value = control.value
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
                  ...popoverOffset(
                    { left, top },
                    index,
                    control.options.length,
                    size,
                  ),
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
                    onClick={() => control.choose(option.value)}
                  >
                    {control.show(option.value)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="tool-button"
        aria-label="All styles"
        title="All styles"
        onClick={() => {
          setOpen(null)
          onAllStyles?.()
        }}
      >
        <SlidersHorizontal size={20} aria-hidden />
      </button>
      <div className="style-control">
        <button
          ref={moreRef}
          type="button"
          className="tool-button"
          aria-label="More"
          title="More"
          aria-haspopup="menu"
          aria-expanded={openKey === 'more'}
          onClick={() =>
            setOpen(openKey === 'more' ? null : { key: 'more', ids })
          }
        >
          <DotsThree size={20} weight="bold" aria-hidden />
        </button>
        {openKey === 'more' && (
          <MoreMenu
            editor={editor}
            canPaste={canPaste}
            onDone={closeMenu}
            style={menuOffset(
              { left, top },
              items.length + 1,
              MORE_ITEMS.length,
              size,
            )}
          />
        )}
      </div>
    </div>
  )
}
