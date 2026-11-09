import { expect, type Page } from '@playwright/test'
import type { Mode } from './fixtures.ts'

/** The parts of a stored element the e2e tests look at. */
export interface StoredElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  label?: { text: string }
  text?: string
  points?: [number, number][]
  curved?: boolean
  startBinding?: { elementId: string }
  endBinding?: { elementId: string; along?: number }
}

/**
 * The drawing's elements as the mode's own storage holds them, or undefined
 * if it isn't stored there. Reading the store directly proves the mode: a
 * self-hosted run that fell back to IndexedDB finds nothing on the server.
 */
export async function storedDocument(
  page: Page,
  mode: Mode,
  id: string,
): Promise<StoredElement[] | undefined> {
  if (mode === 'self-hosted') {
    const response = await page.request.get(`api/drawings/${id}`)
    if (response.status() === 404) return undefined
    expect(response.status()).toBe(200)
    const document = (await response.json()) as { elements: StoredElement[] }
    return document.elements
  }
  // The IndexedDB repository's database and store (ADR 0005).
  return page.evaluate(
    (id) =>
      new Promise<StoredElement[] | undefined>((done, fail) => {
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
            .get(id) as IDBRequest<{ elements: StoredElement[] } | undefined>
          get.onerror = () => fail(get.error)
          get.onsuccess = () => {
            db.close()
            done(get.result?.elements)
          }
        }
      }),
    id,
  )
}

/** How many elements the drawing has in the mode's own storage. */
export async function storedElements(
  page: Page,
  mode: Mode,
  id: string,
): Promise<number | undefined> {
  return (await storedDocument(page, mode, id))?.length
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
