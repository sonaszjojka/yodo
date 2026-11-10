// The bearer token from 5.2 (ADR 0063): with it the server lets a request in
// without the `Origin` header a browser would send, and without a session.

type Fetch = typeof globalThis.fetch

/** `fetch` with `Authorization: Bearer <token>` added, or `fetch` itself without a token. */
export function withBearer(fetch: Fetch, token: string | undefined): Fetch {
  if (!token) return fetch
  return (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }
}
