// Picks the storage mode at startup (ADR 0031). The same build runs on GitHub
// Pages and inside the Go server (ADR 0007), so the app asks whether a Yodo
// server is there instead of being told at build time.

import { HttpDrawingRepository } from './http.ts'
import { HttpImageRepository } from './httpImages.ts'
import type { ImageRepository } from './images.ts'
import {
  IndexedDbDrawingRepository,
  IndexedDbImageRepository,
} from './indexeddb.ts'
import type { DrawingRepository } from './repository.ts'

export type StorageMode = 'hosted' | 'self-hosted'

export interface DetectOptions {
  /** The app root, e.g. `new URL('./', document.baseURI)`. */
  baseUrl: URL
  fetch?: typeof globalThis.fetch
  /** How long to wait for the health check before choosing IndexedDB. */
  timeoutMs?: number
}

/**
 * Whether a Yodo server answers `api/health`. "Answers" means a 200 with
 * `{"status":"ok"}`: GitHub Pages replies 404, and the Vite dev server replies
 * 200 with index.html to every path.
 */
async function serverAnswers(
  baseUrl: URL,
  fetch: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const response = await fetch(new URL('api/health', baseUrl), {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status !== 200) return false
    const body: unknown = await response.json()
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as { status?: unknown }).status === 'ok'
    )
  } catch {
    // Network error, timeout or a non-JSON body: no Yodo server here.
    return false
  }
}

export async function detectRepository({
  baseUrl,
  fetch = globalThis.fetch,
  timeoutMs = 2000,
}: DetectOptions): Promise<{
  mode: StorageMode
  repository: DrawingRepository
  images: ImageRepository
}> {
  // Bound for the same reason as in HttpDrawingRepository.
  const boundFetch = fetch.bind(globalThis)
  if (await serverAnswers(baseUrl, boundFetch, timeoutMs)) {
    return {
      mode: 'self-hosted',
      repository: new HttpDrawingRepository({ baseUrl, fetch: boundFetch }),
      images: new HttpImageRepository({ baseUrl, fetch: boundFetch }),
    }
  }
  return {
    mode: 'hosted',
    repository: new IndexedDbDrawingRepository(),
    images: new IndexedDbImageRepository(),
  }
}
