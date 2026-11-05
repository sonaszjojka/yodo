import {
  ArrowUpRight,
  Circle,
  Cursor,
  Diamond,
  Eraser,
  Hand,
  LineSegment,
  Note,
  PencilSimple,
  Square,
  TextT,
  type Icon,
} from '@phosphor-icons/react'
import type { Tool } from '../core/editor/editor.ts'

export interface ToolEntry {
  tool: Tool
  label: string
  /** The single-key shortcut, shown on the button; matched case-insensitively. */
  key: string
  Icon: Icon
}

/**
 * Every tool in toolbar order (the approved mockup, `docs/ui.md`), with its
 * shortcut. The toolbar and the keyboard both read this list, so they agree.
 * Letters follow Excalidraw where it has the tool.
 */
export const TOOLS: readonly ToolEntry[] = [
  { tool: 'hand', label: 'Hand', key: 'H', Icon: Hand },
  { tool: 'select', label: 'Select', key: 'V', Icon: Cursor },
  { tool: 'rectangle', label: 'Rectangle', key: 'R', Icon: Square },
  { tool: 'diamond', label: 'Diamond', key: 'D', Icon: Diamond },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: Circle },
  { tool: 'arrow', label: 'Arrow', key: 'A', Icon: ArrowUpRight },
  { tool: 'line', label: 'Line', key: 'L', Icon: LineSegment },
  { tool: 'pencil', label: 'Pencil', key: 'P', Icon: PencilSimple },
  { tool: 'text', label: 'Text', key: 'T', Icon: TextT },
  { tool: 'note', label: 'Note', key: 'N', Icon: Note },
  { tool: 'eraser', label: 'Eraser', key: 'E', Icon: Eraser },
]

/** Shortcut key (lower case) → tool, plus `1` for Select as in Excalidraw. */
export const TOOL_KEYS: ReadonlyMap<string, Tool> = new Map([
  ...TOOLS.map(({ key, tool }): [string, Tool] => [key.toLowerCase(), tool]),
  ['1', 'select'],
])
