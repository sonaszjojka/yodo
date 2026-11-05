import { expect, test } from 'vitest'
import { filterShortcuts, SHORTCUT_GROUPS } from './shortcuts.ts'
import { TOOLS } from './tools.ts'

const actions = (query: string) =>
  filterShortcuts(SHORTCUT_GROUPS, query).flatMap((group) =>
    group.shortcuts.map((shortcut) => shortcut.action),
  )

test('an empty or blank query keeps every group', () => {
  expect(filterShortcuts(SHORTCUT_GROUPS, '')).toEqual(SHORTCUT_GROUPS)
  expect(filterShortcuts(SHORTCUT_GROUPS, '   ')).toEqual(SHORTCUT_GROUPS)
})

test('matches the action name, ignoring case', () => {
  expect(actions('RECT')).toEqual(['Rectangle'])
})

test('matches key labels', () => {
  expect(actions('backspace')).toEqual(['Delete'])
  expect(actions('ctrl')).toContain('Undo')
})

test('every word must match', () => {
  expect(actions('shift y')).toEqual(['Redo'])
  expect(actions('rectangle undo')).toEqual([])
})

test('drops groups without a match', () => {
  const groups = filterShortcuts(SHORTCUT_GROUPS, 'rectangle')
  expect(groups.map((group) => group.title)).toEqual(['Tools'])
})

test('no match gives no groups', () => {
  expect(filterShortcuts(SHORTCUT_GROUPS, 'zzzz')).toEqual([])
})

test('lists every tool with its key, and 1 for Select', () => {
  const tools = SHORTCUT_GROUPS.find((group) => group.title === 'Tools')!
  for (const { label, key } of TOOLS) {
    const entry = tools.shortcuts.find((shortcut) => shortcut.action === label)
    expect(entry?.keys[0]).toEqual([key])
  }
  expect(
    tools.shortcuts.find((shortcut) => shortcut.action === 'Select')?.keys,
  ).toContainEqual(['1'])
})

test('has no empty group, action or chord', () => {
  for (const group of SHORTCUT_GROUPS) {
    expect(group.shortcuts.length).toBeGreaterThan(0)
    for (const shortcut of group.shortcuts) {
      expect(shortcut.action).not.toBe('')
      expect(shortcut.keys.length).toBeGreaterThan(0)
      for (const chord of shortcut.keys) expect(chord.length).toBeGreaterThan(0)
    }
  }
})

// The keys the handlers implement beyond the tools. If one is added or
// removed in Canvas.tsx, textKeys.ts or the editor core, update this list.
test('lists the non-tool shortcuts the app implements', () => {
  const all = actions('')
  for (const action of [
    'Undo',
    'Redo',
    'Copy',
    'Cut',
    'Paste elements or an image',
    'Duplicate',
    'Select all',
    'Export image',
    'Delete',
    'Cancel the gesture or selection',
    'Finish editing text',
    'Draw a square, circle or snapped line (hold)',
    'Keep proportions while resizing (hold)',
    'Reset zoom to 100%',
    'Pan the canvas (hold, then drag)',
    'Zoom',
    'Show keyboard shortcuts',
  ]) {
    expect(all).toContain(action)
  }
})

test('the contextual keys are searchable', () => {
  expect(actions('enter')).toEqual(['Finish editing text'])
  expect(actions('esc')).toEqual([
    'Cancel the gesture or selection',
    'Finish editing text',
  ])
  expect(actions('scroll')).toEqual(['Zoom'])
  expect(actions('?')).toEqual(['Show keyboard shortcuts'])
})
