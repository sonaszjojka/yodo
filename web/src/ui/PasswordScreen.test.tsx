import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  PasswordScreenView,
  type PasswordScreenViewProps,
} from './PasswordScreen.tsx'
import { unlockError } from './passwordLogic.ts'

function render(props: Partial<PasswordScreenViewProps> = {}) {
  return renderToStaticMarkup(
    <PasswordScreenView
      password=""
      remember={false}
      busy={false}
      onPassword={() => {}}
      onRemember={() => {}}
      onSubmit={() => {}}
      {...props}
    />,
  )
}

describe('PasswordScreenView', () => {
  test('has a password field, "Remember this browser" and Unlock', () => {
    const html = render()
    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('Remember this browser')
    expect(html).toContain('>Unlock</button>')
    expect(html).not.toContain('role="alert"')
  })

  test('remember is off until it is ticked', () => {
    expect(render()).not.toMatch(/type="checkbox"[^>]*checked/)
    expect(render({ remember: true })).toMatch(/type="checkbox"[^>]*checked/)
  })

  test('shows the error next to the field', () => {
    const html = render({ error: 'Wrong password.' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Wrong password.')
    expect(html).toContain('aria-invalid="true"')
  })

  test('is disabled while unlocking', () => {
    const html = render({ busy: true })
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toContain('Unlocking…')
  })
})

describe('unlockError', () => {
  test('says what went wrong, and nothing on success', () => {
    expect(unlockError('ok')).toBeUndefined()
    expect(unlockError('wrong')).toBe('Wrong password.')
    expect(unlockError('throttled')).toMatch(/Too many/)
    expect(unlockError('failed')).toMatch(/Could not reach/)
  })
})
