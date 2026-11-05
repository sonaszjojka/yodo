import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { createSession, type Session } from '../storage/session.ts'
import { Gate } from './Gate.tsx'
import {
  EDITOR_WINDOW_EVENTS,
  guardEditor,
  keepFromEditor,
} from './passwordLogic.ts'

const app = <p>the app</p>

function sessionWith(passwordRequired: boolean, unlocked: boolean): Session {
  return createSession({ passwordRequired, unlocked }, async () => 'ok')
}

describe('Gate', () => {
  test('passes through without a session (hosted mode)', () => {
    expect(renderToStaticMarkup(<Gate>{app}</Gate>)).toBe('<p>the app</p>')
  })

  test('shows the app, not inert and with no dialog, when no password is needed', () => {
    const html = renderToStaticMarkup(
      <Gate session={sessionWith(false, true)}>{app}</Gate>,
    )
    expect(html).toContain('the app')
    expect(html).not.toContain('inert')
    expect(html).not.toContain('role="dialog"')
  })

  test('locked at start: only the password screen, the app is not mounted', () => {
    const html = renderToStaticMarkup(
      <Gate session={sessionWith(true, false)}>{app}</Gate>,
    )
    expect(html).toContain('type="password"')
    expect(html).not.toContain('the app')
    expect(html).not.toContain('role="dialog"')
  })

  test('locked mid-session: the app stays, inert, under a modal dialog', () => {
    const session = sessionWith(true, true)
    session.lock()
    const html = renderToStaticMarkup(<Gate session={session}>{app}</Gate>)
    expect(html).toContain('the app')
    expect(html).toMatch(/<div[^>]*class="gate-app"[^>]*inert/)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('type="password"')
  })

  test('unlocked after a lock: the dialog goes and the app is live again', async () => {
    const session = sessionWith(true, true)
    session.lock()
    await session.unlock('pw', false)
    const html = renderToStaticMarkup(<Gate session={session}>{app}</Gate>)
    expect(html).toContain('the app')
    expect(html).not.toContain('inert')
    expect(html).not.toContain('role="dialog"')
  })
})

describe('keepFromEditor', () => {
  test('stops the event, so the editor listening on window never sees it', () => {
    const stopPropagation = vi.fn()
    keepFromEditor({ stopPropagation } as never)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })
})

describe('guardEditor', () => {
  // Browsers run capture listeners first; a plain EventTarget runs them in
  // registration order, so the guard goes in before the "editor".
  function setup(inside: boolean) {
    const win = new EventTarget()
    const editor = vi.fn()
    const stop = guardEditor(win, () => inside)
    for (const type of EDITOR_WINDOW_EVENTS) win.addEventListener(type, editor)
    return { win, editor, stop }
  }

  test.each(EDITOR_WINDOW_EVENTS)(
    'a %s outside the dialog never reaches the editor',
    (type) => {
      const { win, editor } = setup(false)
      win.dispatchEvent(new Event(type))
      expect(editor).not.toHaveBeenCalled()
    },
  )

  test('an event inside the dialog is left to the dialog', () => {
    const { win, editor } = setup(true)
    win.dispatchEvent(new Event('keydown'))
    expect(editor).toHaveBeenCalledTimes(1)
  })

  test('after the cleanup the editor hears everything again', () => {
    const { win, editor, stop } = setup(false)
    stop()
    win.dispatchEvent(new Event('keydown'))
    expect(editor).toHaveBeenCalledTimes(1)
  })
})
