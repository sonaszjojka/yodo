import { useSyncExternalStore, type ReactNode } from 'react'
import type { Session } from '../storage/session.ts'
import { keepFromEditor } from './passwordLogic.ts'
import { PasswordScreen } from './PasswordScreen.tsx'

/**
 * Puts the password screen in front of the app when the server wants one
 * (ADR 0020). Locked at start: the screen alone, and the app mounts after the
 * unlock. Locked later (the session ended): the app stays mounted but `inert`,
 * so autosave can retry and unsaved work survives, under a modal dialog.
 */
export function Gate({
  session,
  children,
}: {
  session?: Session
  children: ReactNode
}) {
  if (!session) return children
  return <Locked session={session}>{children}</Locked>
}

function Locked({
  session,
  children,
}: {
  session: Session
  children: ReactNode
}) {
  const { locked, appVisible } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )
  const screen = <PasswordScreen onUnlock={session.unlock} />

  if (!appVisible) return <div className="password-page">{screen}</div>
  return (
    <>
      <div className="gate-app" inert={locked}>
        {children}
      </div>
      {locked && (
        <div className="password-page password-overlay">
          <div
            className="password-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-title"
            onKeyDown={keepFromEditor}
            onKeyUp={keepFromEditor}
            onCopy={keepFromEditor}
            onCut={keepFromEditor}
            onPaste={keepFromEditor}
          >
            {screen}
          </div>
        </div>
      )}
    </>
  )
}
