import { expect, type Page } from '@playwright/test'
import type { Mode } from './fixtures.ts'

/**
 * How many elements the drawing has in the mode's own storage, or undefined
 * if it isn't stored there. Reading the store directly proves the mode: a
 * self-hosted run that fell back to IndexedDB finds nothing on the server.
 */
export async function storedElements(
  page: Page,
  mode: Mode,
  id: string,
): Promise<number | undefined> {
  if (mode === 'self-hosted') {
    const response = await page.request.get(`api/drawings/${id}`)
    if (response.status() === 404) return undefined
    expect(response.status()).toBe(200)
    const document = (await response.json()) as { elements: unknown[] }
    return document.elements.length
  }
  // The IndexedDB repository's database and store (ADR 0005).
  return page.evaluate(
    (id) =>
      new Promise<number | undefined>((done, fail) => {
        const open = indexedDB.open('yodo-data')
        open.onerror = () => fail(open.error)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('documents')) {
            db.close()
            return done(undefined)
          }
          const get = db
            .transaction('documents')
            .objectStore('documents')
            .get(id) as IDBRequest<{ elements: unknown[] } | undefined>
          get.onerror = () => fail(get.error)
          get.onsuccess = () => {
            db.close()
            done(get.result?.elements.length)
          }
        }
      }),
    id,
  )
}

/**
 * Whether the image with this hash is in the mode's own store (ADR 0040):
 * the server's /api/images route, or the `blobs` store in IndexedDB.
 */
export async function hasStoredImage(
  page: Page,
  mode: Mode,
  hash: string,
): Promise<boolean> {
  if (mode === 'self-hosted') {
    const response = await page.request.get(`api/images/${hash}`)
    return response.status() === 200
  }
  return page.evaluate(
    (hash) =>
      new Promise<boolean>((done, fail) => {
        const open = indexedDB.open('yodo-data')
        open.onerror = () => fail(open.error)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('blobs')) {
            db.close()
            return done(false)
          }
          const count = db.transaction('blobs').objectStore('blobs').count(hash)
          count.onerror = () => fail(count.error)
          count.onsuccess = () => {
            db.close()
            done(count.result > 0)
          }
        }
      }),
    hash,
  )
}
