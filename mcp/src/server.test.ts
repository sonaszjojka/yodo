// The server over the 2026-07-28 protocol, in process: `createMcpHandler`
// answers a real client's HTTP requests through `handler.fetch`, so the tool
// schemas, validation and results go through the SDK as they would over stdio
// (ADR 0061, research notes).

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../web/src/core/document/create.ts'
import type { YodoDocument } from '../../web/src/core/document/types.ts'
import { HttpError } from '../../web/src/storage/http.ts'
import { InMemoryDrawingRepository } from '../../web/src/storage/memory.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import { createServer, INSTRUCTIONS } from './server.ts'

const clients: Client[] = []
/** JSON-RPC methods the client sent, in order, across the last `connect`. */
let sent: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
})

async function connect(repo: DrawingRepository): Promise<Client> {
  const handler = createMcpHandler(() =>
    createServer(repo, { baseUrl: new URL('http://127.0.0.1:8080/') }),
  )
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

async function seeded(): Promise<DrawingRepository> {
  let now = 1_000
  const repo = new InMemoryDrawingRepository({ now: () => (now += 1_000) })
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

describe('tools/list', () => {
  it('offers exactly the three read-only tools, plus the instructions', async () => {
    const client = await connect(await seeded())
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_drawing',
      'list_drawings',
      'search_drawings',
    ])
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      })
      expect(tool.description).toBeTruthy()
    }
    expect(client.getInstructions()).toBe(INSTRUCTIONS)
    // The stateless 2026-07-28 protocol: no 2025-era `initialize` handshake.
    expect(sent).not.toContain('initialize')
    expect(sent).toContain('tools/list')
  })
})

describe('list_drawings', () => {
  it('lists the drawings newest first', async () => {
    const client = await connect(await seeded())
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
    const client = await connect(await seeded())
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
    const client = await connect(await seeded())
    const result = await client.callTool({
      name: 'search_drawings',
      arguments: { query: '  ' },
    })
    expect(result.isError).toBe(true)
  })
})

describe('get_drawing', () => {
  it('returns the outline with the revision, ids and boxes', async () => {
    const client = await connect(await seeded())
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

  it('says how to find ids when the drawing is missing', async () => {
    const client = await connect(await seeded())
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
