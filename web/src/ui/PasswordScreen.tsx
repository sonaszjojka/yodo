import { useState, type FormEvent } from 'react'
import type { UnlockResult } from '../storage/session.ts'
import { Logo } from './Logo.tsx'
import { unlockError } from './passwordLogic.ts'

export interface PasswordScreenViewProps {
  password: string
  remember: boolean
  error?: string
  busy: boolean
  onPassword(value: string): void
  onRemember(value: boolean): void
  onSubmit(): void
}

export function PasswordScreenView({
  password,
  remember,
  error,
  busy,
  onPassword,
  onRemember,
  onSubmit,
}: PasswordScreenViewProps) {
  return (
    <form
      className="password-card"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Logo />
      <h1 id="password-title">Enter the password</h1>
      <label className="password-field">
        Password
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'password-error' : undefined}
          onChange={(event) => onPassword(event.target.value)}
        />
      </label>
      <label className="password-remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => onRemember(event.target.checked)}
        />
        Remember this browser
      </label>
      {error && (
        <p id="password-error" className="password-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="password-submit" disabled={busy}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  )
}

export function PasswordScreen({
  onUnlock,
}: {
  onUnlock(password: string, remember: boolean): Promise<UnlockResult>
}) {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(undefined)
    let result: UnlockResult | 'failed'
    try {
      result = await onUnlock(password, remember)
    } catch (caught) {
      console.error('Could not unlock', caught)
      result = 'failed'
    }
    // On success Gate drops this screen, so only a failure needs the state.
    if (result !== 'ok') {
      setError(unlockError(result))
      setBusy(false)
    }
  }

  return (
    <PasswordScreenView
      password={password}
      remember={remember}
      error={error}
      busy={busy}
      onPassword={setPassword}
      onRemember={setRemember}
      onSubmit={() => void submit()}
    />
  )
}
