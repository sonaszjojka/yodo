// The list behind the shortcuts modal (roadmap 2.10, docs/ui.md). It documents
// the keys; the handlers live in Canvas.tsx, textKeys.ts and the editor core.
// When you add or change a key there, change it here too (shortcuts.test.ts
// pins the inventory). Tools derive from TOOLS, so they cannot drift.
import { TOOLS } from './tools.ts'

export interface Shortcut {
  action: string
  /** Alternative chords for the same action; each chord is keys pressed together. */
  keys: string[][]
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const MOD = 'Ctrl/Cmd'

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Tools',
    shortcuts: TOOLS.map(({ label, key, tool }) => ({
      action: label,
      keys: tool === 'select' ? [[key], ['1']] : [[key]],
    })),
  },
  {
    title: 'Editing',
    shortcuts: [
      { action: 'Undo', keys: [[MOD, 'Z']] },
      {
        action: 'Redo',
        keys: [
          ['Shift', MOD, 'Z'],
          ['Ctrl', 'Y'],
        ],
      },
      { action: 'Copy', keys: [[MOD, 'C']] },
      { action: 'Cut', keys: [[MOD, 'X']] },
      { action: 'Paste elements or an image', keys: [[MOD, 'V']] },
      { action: 'Duplicate', keys: [[MOD, 'D']] },
      { action: 'Select all', keys: [[MOD, 'A']] },
      { action: 'Export image', keys: [['Shift', MOD, 'E']] },
      { action: 'Delete', keys: [['Delete'], ['Backspace']] },
      { action: 'Cancel the gesture or selection', keys: [['Esc']] },
      {
        action: 'Edit the label or text of the selected element',
        keys: [['Enter']],
      },
      { action: 'Finish editing text', keys: [['Esc'], [MOD, 'Enter']] },
      {
        action: 'Draw a square, circle or snapped line (hold)',
        keys: [['Shift']],
      },
      { action: 'Keep proportions while resizing (hold)', keys: [['Shift']] },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { action: 'Reset zoom to 100%', keys: [[MOD, '0']] },
      { action: 'Pan the canvas (hold, then drag)', keys: [['Space']] },
      { action: 'Zoom', keys: [[MOD, 'Scroll']] },
      { action: 'Show keyboard shortcuts', keys: [['?']] },
    ],
  },
]

/**
 * The groups that match `query`: every word of it must appear in the action
 * or in a key label (case-insensitive). An empty query keeps everything;
 * groups left without a match are dropped.
 */
export function filterShortcuts(
  groups: readonly ShortcutGroup[],
  query: string,
): ShortcutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...groups]
  const matches = (shortcut: Shortcut) => {
    const text = [shortcut.action, ...shortcut.keys.flat()]
      .join(' ')
      .toLowerCase()
    return words.every((word) => text.includes(word))
  }
  return groups
    .map((group) => ({ ...group, shortcuts: group.shortcuts.filter(matches) }))
    .filter((group) => group.shortcuts.length > 0)
}
