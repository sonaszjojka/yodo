// The server over the 2026-07-28 protocol, in process: `createMcpHandler`
// answers a real client's HTTP requests through `handler.fetch`, so the tool
// schemas, validation and results go through the SDK as they would over stdio
// (ADR 0061, research notes).

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../web/src/core/document/create.ts'
import type { YodoDocument } from '../../web/src/core/document/types.ts'
import { HttpError } from '../../web/src/storage/http.ts'
import { InMemoryDrawingRepository } from '../../web/src/storage/memory.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import { FileDrawingRepository } from './fileRepository.ts'
import {
  createServer,
  INSTRUCTIONS,
  toolError,
  type ServerOptions,
} from './server.ts'
import { parseYodoFile } from '../../web/src/core/document/file.ts'
import { decodeOpenLinkData } from '../../web/src/core/document/openLink.ts'

const clients: Client[] = []
const dirs: string[] = []
/** JSON-RPC methods the client sent, in order, across the last `connect`. */
let sent: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

type MakeRepository = (now: () => number) => Promise<DrawingRepository>

/** Every tool must behave the same on each backend (ADR 0064). */
const backends: [string, MakeRepository][] = [
  ['in memory', async (now) => new InMemoryDrawingRepository({ now })],
  [
    'in files',
    async (now) => {
      const dir = await mkdtemp(join(tmpdir(), 'yodo-mcp-'))
      dirs.push(dir)
      return new FileDrawingRepository({ dir, now })
    },
  ],
]

async function connect(
  repo: DrawingRepository,
  options: ServerOptions = { baseUrl: new URL('http://127.0.0.1:8080/') },
): Promise<Client> {
  const handler = createMcpHandler(() => createServer(repo, options))
  const transport = new StreamableHTTPClientTransport(
    new URL('http://mcp.test/mcp'),
    {
      fetch: async (url, init) => {
        const request = new Request(url, init)
        const body = await request.clone().text()
        if (body) {
          const messages = [JSON.parse(body)].flat() as { method?: string }[]
          sent.push(...messages.flatMap((m) => (m.method ? [m.method] : [])))
        }
        return handler.fetch(request)
      },
    },
  )
  sent = []
  // Pinned: a v2 Client speaks the 2025 protocol unless told otherwise.
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  await client.connect(transport)
  clients.push(client)
  return client
}

function drawing(id: string, name: string, label?: string): YodoDocument {
  const box = createShape(
    'rectangle',
    { x: 10, y: 20, width: 100, height: 50 },
    1,
  )
  return {
    ...createDocument(name),
    id,
    elements: label
      ? [
          {
            ...box,
            id: `${id}-box`,
            label: {
              text: label,
              fontFamily: 'hand',
              fontSize: 20,
              textAlign: 'center',
            },
          },
        ]
      : [],
  }
}

async function seeded(
  make: MakeRepository = backends[0][1],
): Promise<DrawingRepository> {
  let now = 1_000
  const repo = await make(() => (now += 1_000))
  await repo.save(drawing('d-login', 'Login flow', 'Password reset'))
  await repo.save(drawing('d-empty', 'Empty sketch'))
  return repo
}

/** The text of a tool result, which these tools always return as one block. */
function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [block] = result.content as { type: string; text: string }[]
  expect(block.type).toBe('text')
  return block.text
}

/** A repository whose every read fails with `error`. */
function failing(error: unknown): DrawingRepository {
  const fail = () => Promise.reject(error)
  return new Proxy({} as DrawingRepository, { get: () => fail })
}

describe.each(backends)('tools %s', (_name, make) => {
  describe('tools/list', () => {
    it('offers the read and write tools, plus the instructions', async () => {
      const client = await connect(await seeded(make))
      const { tools } = await client.listTools()
      const reads = [
        'get_drawing',
        'list_drawings',
        'render_drawing',
        'search_drawings',
      ]
      const writes = [
        'add_elements',
        'connect',
        'create_diagram',
        'create_drawing',
        'delete_elements',
        'update_elements',
      ]
      expect(tools.map((t) => t.name).sort()).toEqual(
        [...reads, ...writes].sort(),
      )
      for (const tool of tools) {
        expect(tool.description).toBeTruthy()
        if (reads.includes(tool.name)) {
          expect(tool.annotations).toMatchObject({
            readOnlyHint: true,
            openWorldHint: false,
          })
          continue
        }
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          openWorldHint: false,
          idempotentHint: false,
          destructiveHint: tool.name === 'delete_elements',
        })
        // Every write says what its structured result looks like.
        expect(tool.outputSchema).toMatchObject({
          type: 'object',
          required: expect.arrayContaining(['drawingId', 'revision']),
        })
      }
      expect(client.getInstructions()).toBe(INSTRUCTIONS)
      // The stateless 2026-07-28 protocol: no 2025-era `initialize` handshake.
      expect(sent).not.toContain('initialize')
      expect(sent).toContain('tools/list')
    })
  })

  describe('list_drawings', () => {
    it('lists the drawings newest first', async () => {
      const client = await connect(await seeded(make))
      const text = textOf(
        await client.callTool({ name: 'list_drawings', arguments: {} }),
      )
      const lines = text.split('\n')
      expect(lines[0]).toMatch(/^2 drawings/)
      expect(lines[1]).toMatch(
        /^d-empty {2}"Empty sketch" {2}updated .* {2}rev 1$/,
      )
      expect(lines[2]).toMatch(/^d-login {2}"Login flow"/)
    })
  })

  describe('search_drawings', () => {
    it('finds names and canvas text, as Home does', async () => {
      const client = await connect(await seeded(make))
      const byName = textOf(
        await client.callTool({
          name: 'search_drawings',
          arguments: { query: 'login' },
        }),
      )
      expect(byName).toBe('In names:\nd-login  "Login flow"')
      const byText = textOf(
        await client.callTool({
          name: 'search_drawings',
          arguments: { query: 'RESET' },
        }),
      )
      expect(byText).toBe(
        'In text on the canvas:\nd-login  "Login flow"  "Password [reset]"',
      )
    })

    it('rejects a blank query', async () => {
      const client = await connect(await seeded(make))
      const result = await client.callTool({
        name: 'search_drawings',
        arguments: { query: '  ' },
      })
      expect(result.isError).toBe(true)
    })
  })

  describe('get_drawing', () => {
    it('returns the outline with the revision, ids and boxes', async () => {
      const client = await connect(await seeded(make))
      const text = textOf(
        await client.callTool({
          name: 'get_drawing',
          arguments: { id: 'd-login' },
        }),
      )
      expect(text).toBe(
        [
          'Drawing "Login flow" (id d-login, rev 1)',
          '1 elements; bounds 10,20 100x50',
          'Elements, bottom first (id type x,y widthxheight details):',
          'd-login-box rectangle 10,20 100x50 label "Password reset"',
        ].join('\n'),
      )
    })

    it('reaches every element of a large drawing through offset', async () => {
      const repo = await seeded(make)
      const box = createShape(
        'rectangle',
        { x: 0, y: 0, width: 10, height: 10 },
        1,
      )
      const elements = Array.from({ length: 501 }, (_, i) => ({
        ...box,
        id: `e${i}`,
      }))
      await repo.save({ ...createDocument('Big'), id: 'big', elements })
      const client = await connect(repo)

      const first = textOf(
        await client.callTool({
          name: 'get_drawing',
          arguments: { id: 'big' },
        }),
      )
      expect(first).not.toContain('e500 ')
      expect(first).toContain('call get_drawing with offset 500')

      const rest = await client.callTool({
        name: 'get_drawing',
        arguments: { id: 'big', offset: 500 },
      })
      expect(rest.isError).not.toBe(true)
      expect(textOf(rest).split('\n').at(-1)).toBe('e500 rectangle 0,0 10x10')
    })

    it('rejects an offset past the last element, saying how many there are', async () => {
      const client = await connect(await seeded(make))
      const result = await client.callTool({
        name: 'get_drawing',
        arguments: { id: 'd-login', offset: 1 },
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toBe(
        'offset 1 is past the last element: drawing "d-login" has 1 elements (offsets 0-0).',
      )
    })

    it('says how to find ids when the drawing is missing', async () => {
      const client = await connect(await seeded(make))
      const result = await client.callTool({
        name: 'get_drawing',
        arguments: { id: 'nope' },
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toBe(
        'No drawing with id "nope". Call list_drawings or search_drawings for ids.',
      )
    })
  })

  describe('render_drawing', () => {
    type Block = {
      type: string
      text?: string
      data?: string
      mimeType?: string
    }

    async function render(args: Record<string, unknown>) {
      const client = await connect(await seeded(make))
      const result = await client.callTool({
        name: 'render_drawing',
        arguments: { id: 'd-login', ...args },
      })
      return { result, blocks: result.content as Block[] }
    }

    it('returns the whole drawing as a PNG image, with its frame', async () => {
      const { result, blocks } = await render({})
      expect(result.isError).not.toBe(true)
      expect(blocks.map((b) => b.type)).toEqual(['text', 'image'])
      expect(blocks[0]!.text).toContain('frame -6,4 132x82')
      expect(blocks[0]!.text).toContain('scale 1')
      expect(blocks[1]!.mimeType).toBe('image/png')
      const png = Buffer.from(blocks[1]!.data!, 'base64')
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
    })

    it('returns an SVG in the dark theme', async () => {
      const { blocks } = await render({ format: 'svg', theme: 'dark' })
      expect(blocks[1]!.mimeType).toBe('image/svg+xml')
      const svg = Buffer.from(blocks[1]!.data!, 'base64').toString('utf8')
      expect(svg).toContain('<svg')
      expect(svg).toMatch(/>Password<.*>reset</s)
    })

    it('renders chosen ids or a region', async () => {
      const byIds = await render({ ids: ['d-login-box'] })
      expect(byIds.result.isError).not.toBe(true)
      expect(byIds.blocks[0]!.text).toContain('1 elements')
      const byRegion = await render({
        region: { x: 0, y: 0, width: 40, height: 30 },
      })
      expect(byRegion.result.isError).not.toBe(true)
      expect(byRegion.blocks[0]!.text).toContain('frame 0,0 40x30')
    })

    it('rejects ids and a region together', async () => {
      const { result, blocks } = await render({
        ids: ['d-login-box'],
        region: { x: 0, y: 0, width: 40, height: 30 },
      })
      expect(result.isError).toBe(true)
      expect(blocks[0]!.text).toContain('either ids or region')
    })

    it('names an unknown element id', async () => {
      const { result, blocks } = await render({ ids: ['nope'] })
      expect(result.isError).toBe(true)
      expect(blocks[0]!.text).toContain('"nope"')
    })

    it('says how to find ids when the drawing is missing', async () => {
      const { result, blocks } = await render({ id: 'nope' })
      expect(result.isError).toBe(true)
      expect(blocks[0]!.text).toBe(
        'No drawing with id "nope". Call list_drawings or search_drawings for ids.',
      )
    })

    it('refuses an empty drawing', async () => {
      const { result, blocks } = await render({ id: 'd-empty' })
      expect(result.isError).toBe(true)
      expect(blocks[0]!.text).toContain('no elements')
    })
  })
})

type CallResult = Awaited<ReturnType<Client['callTool']>>

interface Written {
  drawingId: string
  revision: number
  created?: string[]
  updated?: string[]
  deleted?: string[]
}

function written(result: CallResult): Written {
  expect(result.isError).toBeFalsy()
  return result.structuredContent as unknown as Written
}

const twoBoxes = [
  { type: 'rectangle', id: 'a', x: 0, y: 0, width: 100, height: 50 },
  { type: 'rectangle', id: 'b', x: 200, y: 0, width: 100, height: 50 },
]

describe.each(backends)('write tools %s', (_name, make) => {
  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallResult> {
    return client.callTool({ name, arguments: args })
  }

  async function outline(client: Client, id: string) {
    return textOf(await call(client, 'get_drawing', { id }))
  }

  describe('create_drawing', () => {
    it('creates a drawing with its elements and returns the ids', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const result = await call(client, 'create_drawing', {
        name: 'Agent sketch',
        elements: [...twoBoxes, { type: 'text', x: 0, y: 100, text: 'Hello' }],
      })
      const out = written(result)
      expect(out.created).toHaveLength(3)
      expect(out.created?.slice(0, 2)).toEqual(['a', 'b'])
      expect(out.revision).toBe(1)
      expect(textOf(result)).toContain(out.drawingId)
      const summaries = await repo.list()
      expect(summaries.map((s) => s.name)).toContain('Agent sketch')
      const text = await outline(client, out.drawingId)
      expect(text).toContain('Hello')
    })

    it('creates an empty drawing', async () => {
      const client = await connect(await seeded(make))
      const out = written(
        await call(client, 'create_drawing', { name: 'Blank' }),
      )
      expect(out.created).toEqual([])
    })

    it('refuses a bad element and saves nothing', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const result = await call(client, 'create_drawing', {
        name: 'Bad',
        elements: [twoBoxes[0], twoBoxes[0]],
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('"a" is already used')
      expect((await repo.list()).map((s) => s.name)).not.toContain('Bad')
    })
  })

  describe('add_elements', () => {
    it('adds elements on top and bumps the revision', async () => {
      const client = await connect(await seeded(make))
      const out = written(
        await call(client, 'add_elements', {
          drawingId: 'd-login',
          elements: [
            { type: 'note', id: 'n1', x: 300, y: 0, label: 'Remember' },
          ],
        }),
      )
      expect(out).toEqual({
        drawingId: 'd-login',
        revision: 2,
        created: ['n1'],
      })
      expect(await outline(client, 'd-login')).toContain('n1')
    })

    it('refuses a transparent note through the schema', async () => {
      const client = await connect(await seeded(make))
      const result = await call(client, 'add_elements', {
        drawingId: 'd-login',
        elements: [
          { type: 'note', x: 0, y: 0, backgroundColor: 'transparent' },
        ],
      })
      expect(result.isError).toBe(true)
    })
  })

  describe('update_elements', () => {
    it('changes elements and reports their ids', async () => {
      const client = await connect(await seeded(make))
      const out = written(
        await call(client, 'update_elements', {
          drawingId: 'd-login',
          patches: [{ id: 'd-login-box', x: 500, label: 'Forgot password' }],
        }),
      )
      expect(out).toEqual({
        drawingId: 'd-login',
        revision: 2,
        updated: ['d-login-box'],
      })
      const text = await outline(client, 'd-login')
      expect(text).toContain('Forgot password')
      expect(text).toContain('500,')
    })
  })

  describe('delete_elements', () => {
    it('deletes elements and reports their ids', async () => {
      const client = await connect(await seeded(make))
      const out = written(
        await call(client, 'delete_elements', {
          drawingId: 'd-login',
          ids: ['d-login-box'],
        }),
      )
      expect(out).toEqual({
        drawingId: 'd-login',
        revision: 2,
        deleted: ['d-login-box'],
      })
      expect(await outline(client, 'd-login')).not.toContain('d-login-box')
    })
  })

  describe('connect', () => {
    it('adds a bound arrow between two elements', async () => {
      const client = await connect(await seeded(make))
      const created = written(
        await call(client, 'create_drawing', {
          name: 'Flow',
          elements: twoBoxes,
        }),
      )
      const out = written(
        await call(client, 'connect', {
          drawingId: created.drawingId,
          revision: created.revision,
          connections: [{ from: 'a', to: 'b', id: 'a-b' }],
        }),
      )
      expect(out).toEqual({
        drawingId: created.drawingId,
        revision: 2,
        created: ['a-b'],
      })
      const text = await outline(client, created.drawingId)
      expect(text).toMatch(/a-b.*a.*b/)
    })
  })

  describe('create_diagram', () => {
    const nodes = [
      { id: 'start', label: 'Start' },
      { id: 'ok', label: 'Valid?', shape: 'diamond' },
      { id: 'done', label: 'Done', shape: 'ellipse' },
    ]
    const edges = [
      { from: 'start', to: 'ok' },
      { from: 'ok', to: 'done', label: 'yes', id: 'yes' },
    ]

    it('lays out a new drawing with shapes, bound arrows and labels', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const out = written(
        await call(client, 'create_diagram', {
          name: 'Flow',
          nodes,
          edges,
          direction: 'LR',
        }),
      )
      expect(out.revision).toBe(1)
      expect(out.created?.slice(0, 3)).toEqual(['start', 'ok', 'done'])
      expect(out.created).toContain('yes')
      expect(out.created).toHaveLength(6)
      const stored = await repo.getWithRevision(out.drawingId)
      expect(stored?.doc.name).toBe('Flow')
      const arrow = stored?.doc.elements.find((e) => e.id === 'yes')
      expect(arrow).toMatchObject({
        type: 'arrow',
        startBinding: { elementId: 'ok' },
        endBinding: { elementId: 'done' },
      })
      expect(await outline(client, out.drawingId)).toContain('Valid?')
    })

    it('adds to an existing drawing at its revision', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const out = written(
        await call(client, 'create_diagram', {
          drawingId: 'd-login',
          revision: 1,
          nodes,
          edges,
        }),
      )
      expect(out).toMatchObject({ drawingId: 'd-login', revision: 2 })
      const stored = await repo.getWithRevision('d-login')
      expect(stored?.doc.elements).toHaveLength(1 + 6)
    })

    it('refuses a stale revision and changes nothing', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const result = await call(client, 'create_diagram', {
        drawingId: 'd-login',
        revision: 7,
        nodes,
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('Call get_drawing again')
      expect((await repo.getWithRevision('d-login'))?.revision).toBe(1)
    })

    it('needs exactly one of name and drawingId', async () => {
      const client = await connect(await seeded(make))
      for (const args of [
        { nodes },
        { name: 'X', drawingId: 'd-login', nodes },
      ]) {
        const result = await call(client, 'create_diagram', args)
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain('name')
        expect(textOf(result)).toContain('drawingId')
      }
    })

    it('refuses an edge to a missing node and saves nothing', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const result = await call(client, 'create_diagram', {
        name: 'Broken',
        nodes,
        edges: [{ from: 'start', to: 'nowhere' }],
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('"nowhere"')
      expect((await repo.list()).map((s) => s.name)).not.toContain('Broken')
    })

    it('renders the result with render_drawing', async () => {
      const client = await connect(await seeded(make))
      const out = written(
        await call(client, 'create_diagram', { name: 'Flow', nodes, edges }),
      )
      const result = await client.callTool({
        name: 'render_drawing',
        arguments: { id: out.drawingId },
      })
      const blocks = result.content as { type: string; data?: string }[]
      expect(blocks.map((b) => b.type)).toEqual(['text', 'image'])
      const png = Buffer.from(blocks[1]!.data!, 'base64')
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
    })
  })

  describe('conflicts and missing drawings', () => {
    it('refuses a stale revision with a re-read hint and changes nothing', async () => {
      const repo = await seeded(make)
      const client = await connect(repo)
      const result = await call(client, 'delete_elements', {
        drawingId: 'd-login',
        revision: 7,
        ids: ['d-login-box'],
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toBe(
        'Drawing "d-login" changed since revision 7 (it is now at revision 1). ' +
          'Call get_drawing again and retry with the new revision.',
      )
      const stored = await repo.getWithRevision('d-login')
      expect(stored?.revision).toBe(1)
      expect(stored?.doc.elements).toHaveLength(1)
    })

    it('turns a save that loses a race into the same hint', async () => {
      const repo = await seeded(make)
      // Another writer saves between the tool's read and its save.
      const racing = new Proxy(repo, {
        get(target, key, receiver) {
          if (key === 'save') {
            return async (...args: Parameters<DrawingRepository['save']>) => {
              const found = await target.getWithRevision('d-login')
              await target.save(found!.doc)
              return target.save(...args)
            }
          }
          const value = Reflect.get(target, key, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const client = await connect(racing)
      const result = await call(client, 'add_elements', {
        drawingId: 'd-login',
        elements: [{ type: 'text', x: 0, y: 0, text: 'late' }],
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain(
        'changed since revision 1 (it is now at revision 2)',
      )
      expect(textOf(result)).toContain('Call get_drawing again and retry')
    })

    it('names a missing drawing', async () => {
      const client = await connect(await seeded(make))
      for (const [name, args] of [
        ['add_elements', { elements: [twoBoxes[0]] }],
        ['update_elements', { patches: [{ id: 'x', x: 1 }] }],
        ['delete_elements', { ids: ['x'] }],
        ['connect', { connections: [{ from: 'a', to: 'b' }] }],
      ] as const) {
        const result = await call(client, name, { drawingId: 'nope', ...args })
        expect(result.isError).toBe(true)
        expect(textOf(result)).toBe(
          'No drawing with id "nope". Call list_drawings or search_drawings for ids.',
        )
      }
    })
  })
})

describe('errors from the server', () => {
  it('points a 401 at the API token', async () => {
    const client = await connect(
      failing(
        new HttpError(401, 'GET /api/drawings failed with 401: unauthorized'),
      ),
    )
    const result = await client.callTool({
      name: 'list_drawings',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('(401): the API token is missing or wrong')
    expect(textOf(result)).toContain('YODO_API_TOKEN')
  })

  it("keeps the server's reason for a 403", async () => {
    const reason =
      'GET /api/drawings failed with 403: forbidden: host or origin not allowed (see YODO_ALLOWED_ORIGINS)'
    const client = await connect(failing(new HttpError(403, reason)))
    const result = await client.callTool({
      name: 'get_drawing',
      arguments: { id: 'x' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(`(403): ${reason}`)
    expect(textOf(result)).toContain(
      "YODO_URL's host is in the server's YODO_ALLOWED_ORIGINS",
    )
  })

  it('says when the server is unreachable', async () => {
    const client = await connect(failing(new TypeError('fetch failed')))
    const result = await client.callTool({
      name: 'search_drawings',
      arguments: { query: 'a' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      "Can't reach Yodo at http://127.0.0.1:8080/: fetch failed. Is the server running, and is YODO_URL right?",
    )
  })
})

describe('open links with the file backend (ADR 0069)', () => {
  const appUrl = new URL('https://draw.example.com/yodo/')

  async function fileClient() {
    const dir = await mkdtemp(join(tmpdir(), 'yodo-mcp-'))
    dirs.push(dir)
    const repo = new FileDrawingRepository({ dir })
    const client = await connect(repo, {
      dir,
      openLinks: {
        appUrl,
        exportFile: (id, revision) => repo.exportFile(id, revision),
      },
    })
    return { dir, repo, client }
  }

  it('every write returns the file and a link to that revision', async () => {
    const { dir, client } = await fileClient()
    const created = await client.callTool({
      name: 'create_drawing',
      arguments: { name: 'Linked', elements: twoBoxes },
    })
    const out = created.structuredContent as {
      drawingId: string
      file: string
      openUrl: string
    }
    expect(out.file).toBe(join(dir, `${out.drawingId}.yodo`))
    expect(out.openUrl.startsWith(`${appUrl.href}#/open/`)).toBe(true)
    expect(textOf(created)).toContain(`Open in Yodo: ${out.openUrl}`)

    const connected = await client.callTool({
      name: 'connect',
      arguments: {
        drawingId: out.drawingId,
        connections: [{ from: 'a', to: 'b' }],
      },
    })
    const after = connected.structuredContent as { openUrl: string }
    const data = after.openUrl.slice(`${appUrl.href}#/open/`.length)
    const { document } = parseYodoFile(await decodeOpenLinkData(data))
    expect(document.name).toBe('Linked')
    expect(document.elements.map((e) => e.type)).toEqual([
      'rectangle',
      'rectangle',
      'arrow',
    ])
  })

  it('without openLinks (the HTTP backend) results have neither field', async () => {
    const client = await connect(new InMemoryDrawingRepository())
    const result = await client.callTool({
      name: 'create_drawing',
      arguments: { name: 'Plain' },
    })
    expect(result.structuredContent).not.toHaveProperty('file')
    expect(result.structuredContent).not.toHaveProperty('openUrl')
    expect(textOf(result)).not.toContain('Open in Yodo')
  })

  it('the instructions tell the agent to hand the link over', () => {
    expect(INSTRUCTIONS).toContain('Open in Yodo')
  })
})

describe('errors from the file backend', () => {
  it('names the directory in a file-system error', () => {
    const error = Object.assign(
      new Error("EACCES: permission denied, scandir '/x'"),
      {
        code: 'EACCES',
      },
    )
    const result = toolError(error, { dir: '/home/ada/Yodo' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      "Can't read the drawings in /home/ada/Yodo: EACCES: permission denied, scandir '/x'. " +
        'Check that YODO_MCP_DIR is a folder this process can read and write.',
    )
  })
})
