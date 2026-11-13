import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../web/src/core/document/create.ts'
import {
  parseYodoFile,
  serializeYodoFile,
} from '../../web/src/core/document/file.ts'
import type { YodoDocument } from '../../web/src/core/document/types.ts'
import { describeRepositoryContract } from '../../web/src/storage/contract.ts'
import { FileDrawingRepository, fileNameFor, idFor } from './fileRepository.ts'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yodo-files-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    // A test may leave a directory read-only.
    await chmod(join(dir, '.trash'), 0o700).catch(() => {})
    await chmod(dir, 0o700).catch(() => {})
    await rm(dir, { recursive: true, force: true })
  }
})

describeRepositoryContract(
  'FileDrawingRepository',
  async () => new FileDrawingRepository({ dir: await tempDir() }),
)

function drawing(name: string): YodoDocument {
  return {
    ...createDocument(name),
    elements: [createShape('rectangle', { x: 1, y: 2, width: 3, height: 4 })],
  }
}

const png = { mimeType: 'image/png', data: 'iVBORw0KGgo=' }

interface Setup {
  dir: string
  repo: FileDrawingRepository
  warnings: string[]
}

async function setup(): Promise<Setup> {
  const dir = await tempDir()
  const warnings: string[] = []
  let time = 1000
  const repo = new FileDrawingRepository({
    dir,
    now: () => time++,
    warn: (message) => warnings.push(message),
  })
  return { dir, repo, warnings }
}

function live(dir: string, id: string): string {
  return join(dir, `${fileNameFor(id)}.yodo`)
}

describe('file names', () => {
  test.each([
    '3f1c0a6e-1b2c-4d5e-8f90-123456789abc',
    'a/b',
    '%2E',
    '.',
    '..',
    'Ab',
    'żółw',
  ])('map %j to a safe name and back', (id) => {
    const name = fileNameFor(id)!
    expect(name).toMatch(/^[a-z0-9%A-F-]+$/)
    expect(idFor(`${name}.yodo`)).toBe(id)
  })

  test('keep an app id readable', () => {
    const id = '3f1c0a6e-1b2c-4d5e-8f90-123456789abc'
    expect(fileNameFor(id)).toBe(id)
  })

  test('tell ids apart that differ only in case', () => {
    expect(fileNameFor('Ab')).not.toBe(fileNameFor('ab'))
    expect(fileNameFor('Ab')!.toLowerCase()).not.toBe(fileNameFor('ab'))
  })

  test('refuse an empty or too long id', () => {
    expect(fileNameFor('')).toBeUndefined()
    expect(fileNameFor('x'.repeat(201))).toBeUndefined()
  })

  // UTF-8 can't hold a lone surrogate: encoding turns each into U+FFFD, so
  // two such ids would share one file (Codex review round 1, finding 1).
  test.each(['\uD800', '\uDC00', 'a\uD801b', '\uDC00\uD800'])(
    'refuse the ill-formed id %j',
    (id) => {
      expect(fileNameFor(id)).toBeUndefined()
    },
  )

  test('keep a leading byte order mark', () => {
    const id = '﻿drawing'
    expect(idFor(`${fileNameFor(id)}.yodo`)).toBe(id)
  })

  test('only accept the canonical spelling', () => {
    expect(idFor('a%2fb.yodo')).toBeUndefined()
    expect(idFor('Ab.yodo')).toBeUndefined()
    expect(idFor('.tmp-123')).toBeUndefined()
    expect(idFor('.yodo')).toBeUndefined()
  })
})

describe('FileDrawingRepository files', () => {
  test('stores a file the app can import, with its metadata', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Plan')

    await repo.save(doc)

    const parsed = parseYodoFile(await readFile(live(dir, doc.id), 'utf8'))
    expect(parsed.document).toEqual(doc)
    expect(parsed.meta).toEqual({
      createdAt: 1000,
      updatedAt: 1000,
      revision: 1,
    })
  })

  test('creates the directory on the first save; a missing one lists empty', async () => {
    const { dir } = await setup()
    const repo = new FileDrawingRepository({ dir: join(dir, 'new', 'Yodo') })

    expect(await repo.list()).toEqual([])
    await repo.save(drawing('First'))
    expect(await repo.list()).toHaveLength(1)
  })

  test('leaves no temp file behind and ignores stray ones', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Plan')
    await repo.save(doc)
    await repo.save(doc)
    expect(await readdir(dir)).toEqual([`${doc.id}.yodo`])

    // A crash mid-write leaves a temp file, maybe half written.
    await writeFile(join(dir, '.tmp-crashed'), '{"schemaVer')
    await writeFile(join(dir, 'notes.txt'), 'hello')
    expect((await repo.list()).map((s) => s.id)).toEqual([doc.id])
  })

  test('a failing write keeps the old file and no temp file', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Plan')
    await repo.save(doc)
    await chmod(dir, 0o500)

    await expect(repo.save({ ...doc, name: 'Changed' })).rejects.toThrow()

    await chmod(dir, 0o700)
    expect(await readdir(dir)).toEqual([`${doc.id}.yodo`])
    expect((await repo.get(doc.id))?.name).toBe('Plan')
  })

  test('reads an app export that has no meta section', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Exported')
    await writeFile(live(dir, doc.id), serializeYodoFile(doc, {}))

    const [summary] = await repo.list()
    expect(summary).toMatchObject({ id: doc.id, name: 'Exported', revision: 1 })
    expect(summary!.createdAt).toBeGreaterThan(0)
    expect(await repo.get(doc.id)).toEqual(doc)

    await repo.save(doc, { expectedRevision: 1 })
    const parsed = parseYodoFile(await readFile(live(dir, doc.id), 'utf8'))
    expect(parsed.meta).toMatchObject({ revision: 2, updatedAt: 1000 })
  })

  test('skips a broken, misnamed or malformed-meta file with a warning', async () => {
    const { dir, repo, warnings } = await setup()
    const good = drawing('Good')
    await repo.save(good)
    const other = drawing('Other')
    await writeFile(join(dir, 'broken.yodo'), 'not json')
    await writeFile(join(dir, 'misnamed.yodo'), serializeYodoFile(other, {}))
    await writeFile(
      live(dir, other.id),
      serializeYodoFile(other, {}, { revision: 'one' }),
    )

    expect((await repo.list()).map((s) => s.id)).toEqual([good.id])
    expect(await repo.get(other.id)).toBeUndefined()
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })

  test('keeps images across saves and refuses one it has no bytes for', async () => {
    const { dir, repo } = await setup()
    const doc = { ...drawing('Pictures'), fileIds: ['hash-a'] }
    await writeFile(
      live(dir, doc.id),
      serializeYodoFile(
        doc,
        { 'hash-a': png },
        { createdAt: 1, updatedAt: 1, revision: 1 },
      ),
    )

    await repo.save({ ...doc, name: 'Renamed' })
    const after = parseYodoFile(await readFile(live(dir, doc.id), 'utf8'))
    expect(after.files).toEqual({ 'hash-a': png })

    await expect(
      repo.save({ ...doc, fileIds: ['hash-a', 'hash-b'] }),
    ).rejects.toThrow(/hash-b/)
    expect((await repo.get(doc.id))?.fileIds).toEqual(['hash-a'])
  })

  test('refuses an id that would make a too long file name', async () => {
    const { repo } = await setup()
    const doc = { ...drawing('Long'), id: 'x'.repeat(201) }

    await expect(repo.save(doc)).rejects.toThrow(/file name/)
    expect(await repo.get(doc.id)).toBeUndefined()
  })

  test('never lets two ill-formed ids overwrite each other', async () => {
    const { repo } = await setup()
    const first = { ...drawing('First'), id: '\uD800' }
    const second = { ...drawing('Second'), id: '\uD801' }

    await expect(repo.save(first)).rejects.toThrow(/file name/)
    await expect(repo.save(second)).rejects.toThrow(/file name/)
    expect(await repo.list()).toEqual([])
  })

  test('lists and finds a drawing whose id starts with a byte order mark', async () => {
    const { repo } = await setup()
    const doc = { ...drawing('Marked'), id: '﻿drawing' }

    await repo.save(doc)

    expect((await repo.list()).map((s) => s.id)).toEqual([doc.id])
    expect((await repo.searchIndex()).map((e) => e.id)).toEqual([doc.id])
  })

  test('has no folders: moving into one rejects, out of one works', async () => {
    const { repo } = await setup()
    const doc = drawing('Plan')
    const saved = await repo.save(doc)

    await expect(repo.move(doc.id, 'some-folder')).rejects.toThrow(
      /does not exist/,
    )
    expect(await repo.move(doc.id, null)).toEqual(saved)
    expect(await repo.move('missing', 'some-folder')).toBeUndefined()
  })
})

describe('FileDrawingRepository Trash files', () => {
  test('keeps a trashed drawing in .trash/ and moves it back on restore', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Plan')
    await repo.save(doc)

    await repo.trash(doc.id)
    expect(await readdir(dir)).toEqual(['.trash'])
    expect(await readdir(join(dir, '.trash'))).toEqual([`${doc.id}.yodo`])

    await repo.restore(doc.id)
    expect(await readdir(dir)).toEqual(['.trash', `${doc.id}.yodo`])
    expect(await readdir(join(dir, '.trash'))).toEqual([])
  })

  test('the Trash copy wins when a crash left both', async () => {
    const { dir, repo } = await setup()
    const doc = drawing('Plan')
    await repo.save(doc)
    await repo.trash(doc.id)
    // As if trash() stopped before removing the live file.
    await writeFile(
      live(dir, doc.id),
      serializeYodoFile(
        doc,
        {},
        { createdAt: 1000, updatedAt: 1000, revision: 1 },
      ),
    )

    expect(await repo.list()).toEqual([])
    expect((await repo.listTrash()).map((s) => s.id)).toEqual([doc.id])
    expect(await repo.searchIndex()).toEqual([])

    await repo.emptyTrash()
    expect(await repo.list()).toEqual([])
    expect(await repo.get(doc.id)).toBeUndefined()
  })

  test.each(['emptyTrash', 'delete'] as const)(
    '%s removes the live copy first, so a failed second step revives nothing',
    async (method) => {
      const { dir, repo } = await setup()
      const doc = drawing('Plan')
      await repo.save(doc)
      await repo.trash(doc.id)
      await writeFile(
        live(dir, doc.id),
        serializeYodoFile(
          doc,
          {},
          { createdAt: 1000, updatedAt: 1000, revision: 1 },
        ),
      )
      // The Trash copy can't be removed now.
      await chmod(join(dir, '.trash'), 0o500)

      await expect(
        method === 'delete' ? repo.delete(doc.id) : repo.emptyTrash(),
      ).rejects.toThrow()

      await chmod(join(dir, '.trash'), 0o700)
      expect(await repo.list()).toEqual([])
      expect(await readdir(dir)).toEqual(['.trash'])
    },
  )
})

describe('FileDrawingRepository across processes (ADR 0067)', () => {
  test('two repositories on one directory never both win a save', async () => {
    const dir = await tempDir()
    // Two instances share no in-process queue, like two MCP processes.
    const first = new FileDrawingRepository({ dir })
    const second = new FileDrawingRepository({ dir })
    const doc = drawing('Shared')
    await first.save(doc)
    for (let round = 1; round <= 5; round++) {
      const results = await Promise.allSettled([
        first.save(
          { ...doc, name: `first ${round}` },
          { expectedRevision: round },
        ),
        second.save(
          { ...doc, name: `second ${round}` },
          { expectedRevision: round },
        ),
      ])
      const won = results.filter((r) => r.status === 'fulfilled')
      expect(won).toHaveLength(1)
      const loser = results.find((r) => r.status === 'rejected')
      expect((loser as PromiseRejectedResult).reason).toMatchObject({
        name: 'RevisionConflictError',
        currentRevision: round + 1,
      })
      const stored = await first.getWithRevision(doc.id)
      expect(stored?.revision).toBe(round + 1)
      expect(stored?.doc.name).toBe(
        (won[0] as PromiseFulfilledResult<{ name: string }>).value.name,
      )
    }
    // The lock is gone once nobody writes.
    expect(await readdir(dir)).not.toContain('.lock')
  })
})

describe('FileDrawingRepository.exportFile (ADR 0069)', () => {
  test('gives the path and the export text without metadata', async () => {
    const { dir, repo } = await setup()
    const doc = { ...drawing('Plan'), fileIds: ['f1'] }
    // An app export with an image, dropped into the folder.
    await writeFile(live(dir, doc.id), serializeYodoFile(doc, { f1: png }))

    const exported = await repo.exportFile(doc.id, 1)

    expect(exported).toEqual({
      path: live(dir, doc.id),
      text: expect.any(String),
    })
    const parsed = parseYodoFile((exported as { text: string }).text)
    expect(parsed.document).toEqual(doc)
    expect(parsed.files).toEqual({ f1: png })
    expect(parsed.meta).toBeUndefined()
  })

  test('says changed when another process saved since that revision', async () => {
    const dir = await tempDir()
    const agent = new FileDrawingRepository({ dir })
    const other = new FileDrawingRepository({ dir })
    const doc = drawing('Shared')
    const { revision } = await agent.save(doc)
    await other.save({ ...doc, name: 'Edited elsewhere' })

    expect(await agent.exportFile(doc.id, revision)).toEqual({
      path: live(dir, doc.id),
      changed: true,
    })
  })

  test('is undefined for a missing or trashed drawing', async () => {
    const { repo } = await setup()
    const doc = drawing('Gone')
    await repo.save(doc)
    await repo.trash(doc.id)

    expect(await repo.exportFile(doc.id, 1)).toBeUndefined()
    expect(await repo.exportFile('nope', 1)).toBeUndefined()
  })
})
