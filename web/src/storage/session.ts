// The optional password of the self-hosted server (ADR 0020). The server keeps
// a session behind an httpOnly cookie, so the app never sees a token: it asks
// whether a password is needed, sends it once, and the browser does the rest.

export interface SessionState {
  passwordRequired: boolean
  /** True when no password is needed, or the cookie holds a live session. */
  unlocked: boolean
}

export type UnlockResult = 'ok' | 'wrong' | 'throttled'

/** Asks `api/session`; throws if the server doesn't answer in time. */
export async function getSessionState(
  baseUrl: URL,
  fetch: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<SessionState> {
  const response = await fetch(new URL('api/session', baseUrl), {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status !== 200) {
    throw new Error(`GET api/session answered ${response.status}`)
  }
  const body = (await response.json()) as Partial<SessionState> | null
  if (
    typeof body?.passwordRequired !== 'boolean' ||
    typeof body.unlocked !== 'boolean'
  ) {
    throw new Error('GET api/session answered an unexpected body')
  }
  return { passwordRequired: body.passwordRequired, unlocked: body.unlocked }
}

/** Sends the password; throws on a network error or an unexpected status. */
export async function sendPassword(
  baseUrl: URL,
  fetch: typeof globalThis.fetch,
  password: string,
  remember: boolean,
): Promise<UnlockResult> {
  const response = await fetch(new URL('api/session', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, remember }),
  })
  if (response.status === 204) return 'ok'
  if (response.status === 401) return 'wrong'
  if (response.status === 429) return 'throttled'
  throw new Error(`POST api/session answered ${response.status}`)
}

/** What the UI shows: whether the app is behind the password screen. */
export interface LockSnapshot {
  /** The server wants a password right now. */
  locked: boolean
  /**
   * The app has been unlocked at least once. Before that nothing of it may
   * mount (its first requests would all fail); after that it stays mounted
   * under the password dialog, so unsaved work survives a session that ended.
   */
  appVisible: boolean
}

export interface Session {
  /** Stable between changes, for `useSyncExternalStore`. */
  getSnapshot(): LockSnapshot
  subscribe(listener: () => void): () => void
  /** The server answered 401: the session ended (or the server restarted). */
  lock(): void
  unlock(password: string, remember: boolean): Promise<UnlockResult>
  /** Resolves at once if unlocked, otherwise after the next successful unlock. */
  untilUnlocked(): Promise<void>
  /** Calls `listener` after every successful unlock. */
  onUnlocked(listener: () => void): () => void
}

export function createSession(
  initial: SessionState,
  send: (password: string, remember: boolean) => Promise<UnlockResult>,
): Session {
  let snapshot: LockSnapshot = {
    locked: initial.passwordRequired && !initial.unlocked,
    appVisible: !(initial.passwordRequired && !initial.unlocked),
  }
  const listeners = new Set<() => void>()
  const unlockedListeners = new Set<() => void>()

  function set(next: LockSnapshot) {
    if (
      next.locked === snapshot.locked &&
      next.appVisible === snapshot.appVisible
    ) {
      return
    }
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    lock() {
      set({ ...snapshot, locked: true })
    },
    async unlock(password, remember) {
      const result = await send(password, remember)
      if (result === 'ok') {
        set({ locked: false, appVisible: true })
        unlockedListeners.forEach((listener) => listener())
      }
      return result
    },
    untilUnlocked() {
      if (!snapshot.locked) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const release = () => {
          unlockedListeners.delete(release)
          resolve()
        }
        unlockedListeners.add(release)
      })
    },
    onUnlocked(listener) {
      unlockedListeners.add(listener)
      return () => void unlockedListeners.delete(listener)
    },
  }
}
