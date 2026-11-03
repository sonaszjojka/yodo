import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { Toolbar } from './Toolbar.tsx'
import { TOOL_KEYS, TOOLS } from './tools.ts'

/** The opening tag of the button with this accessible label. */
function button(html: string, label: string) {
  return html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0]
}

test('shows every tool with its shortcut', () => {
  const html = renderToStaticMarkup(
    <Toolbar editor={createEditor(createDocument())} />,
  )

  for (const { label, key } of TOOLS) {
    expect(button(html, `${label}, shortcut ${key}`)).toContain(
      `title="${label} (${key})"`,
    )
  }
})

test('marks only the active tool as pressed', () => {
  const editor = createEditor(createDocument())
  editor.setTool('eraser')

  const html = renderToStaticMarkup(<Toolbar editor={editor} />)

  expect(button(html, 'Eraser, shortcut E')).toContain('aria-pressed="true"')
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
})

test('every tool has its own single-key shortcut', () => {
  const keys = TOOLS.map(({ key }) => key.toLowerCase())

  expect(new Set(keys).size).toBe(TOOLS.length)
  for (const { tool, key } of TOOLS) {
    expect(key).toHaveLength(1)
    expect(TOOL_KEYS.get(key.toLowerCase())).toBe(tool)
  }
})
