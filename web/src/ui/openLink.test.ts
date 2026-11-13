import { describe, expect, test, vi } from 'vitest'
import v1Export from '../core/document/fixtures/v1-export.yodo?raw'
import { DocumentError } from '../core/document/migrate.ts'
import {
  encodeOpenLinkData,
  MAX_OPEN_LINK_DATA,
  OpenLinkError,
} from '../core/document/openLink.ts'
import { CURRENT_SCHEMA_VERSION } from '../core/document/types.ts'
import {
  createOpener,
  openLinkErrorMessage,
  readOpenLink,
  type OpenerDeps,
} from './openLink.ts'

const DAMAGED = 'This link is damaged or incomplete. Ask for a new one.'

describe('readOpenLink', () => {
  test('a good link gives the text, name and element count', async () => {
    const doc = JSON.parse(v1Export) as { name: string; elements: unknown[] }
    const read = await readOpenLink(await encodeOpenLinkData(v1Export))
    expect(read).toEqual({
      status: 'ready',
      text: v1Export,
      name: doc.name,
      elementCount: doc.elements.length,
    })
  })

  test.each([
    [
      'too long',
      'A'.repeat(MAX_OPEN_LINK_DATA + 1),
      'This link is too long for Yodo to open.',
    ],
    ['bad characters', 'a+b/c', DAMAGED],
    ['empty', '', DAMAGED],
  ])('%s data is an error', async (_, data, message) => {
    expect(await readOpenLink(data)).toEqual({ status: 'error', message })
  })

  test('text that isn’t a Yodo file is an error', async () => {
    const read = await readOpenLink(await encodeOpenLinkData('{"hello":1}'))
    expect(read).toEqual({ status: 'error', message: DAMAGED })
  })

  test('a newer schema version asks to update Yodo', async () => {
    const newer = JSON.stringify({
      ...JSON.parse(v1Export),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    })
    const read = await readOpenLink(await encodeOpenLinkData(newer))
    expect(read).toEqual({
      status: 'error',
      message:
        'This link was made by a newer version of Yodo. Update Yodo to open it.',
    })
  })
})

test('openLinkErrorMessage words each kind of error', () => {
  expect(openLinkErrorMessage(new OpenLinkError('too-large', 'x'))).toBe(
    DAMAGED,
  )
  expect(openLinkErrorMessage(new DocumentError('bad-files', 'x'))).toBe(
    DAMAGED,
  )
  expect(openLinkErrorMessage(new Error('offline'))).toBe(
    'Couldn’t open this link. Try again.',
  )
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function deps(overrides: Partial<OpenerDeps> = {}) {
  return {
    waitForEditor: vi.fn(() => Promise.resolve(true)),
    importText: vi.fn(() => Promise.resolve('new-id')),
    isCurrent: vi.fn(() => true),
    show: vi.fn(),
    ...overrides,
  } satisfies OpenerDeps
}

describe('createOpener', () => {
  test('waits for the closing editor, imports, then shows the drawing', async () => {
    const order: string[] = []
    const d = deps({
      waitForEditor: vi.fn(async () => order.push('wait')),
      importText: vi.fn(async () => {
        order.push('import')
        return 'new-id'
      }),
    })
    expect(await createOpener(d)('text')).toBe('opened')
    expect(order).toEqual(['wait', 'import'])
    expect(d.importText).toHaveBeenCalledWith('text')
    expect(d.show).toHaveBeenCalledWith('new-id')
  })

  test('a second click while importing imports nothing more', async () => {
    const pending = deferred<string>()
    const d = deps({ importText: vi.fn(() => pending.promise) })
    const open = createOpener(d)
    const first = open('text')
    expect(await open('text')).toBe('busy')
    pending.resolve('new-id')
    expect(await first).toBe('opened')
    expect(d.importText).toHaveBeenCalledTimes(1)
  })

  test('a route change during a slow import isn’t overwritten', async () => {
    const pending = deferred<string>()
    let current = true
    const d = deps({
      importText: vi.fn(() => pending.promise),
      isCurrent: () => current,
    })
    const result = createOpener(d)('text')
    current = false // e.g. Back, or another link, while the save is slow
    pending.resolve('new-id')
    expect(await result).toBe('left')
    expect(d.show).not.toHaveBeenCalled()
  })

  test('a failed import reaches the caller and allows another try', async () => {
    const d = deps({
      importText: vi
        .fn<OpenerDeps['importText']>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce('new-id'),
    })
    const open = createOpener(d)
    await expect(open('text')).rejects.toThrow('offline')
    expect(await open('text')).toBe('opened')
  })
})
