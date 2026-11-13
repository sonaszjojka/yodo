// Every MCP tool against the real Go server (5.9): the self-hosted stack an
// agent uses, `HttpDrawingRepository` with the `YODO_API_TOKEN` bearer (ADR
// 0063), behind the SDK as in server.test.ts. Run with `npm run test:server`.

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import { withBearer } from './auth.ts'
import { createServer } from './server.ts'

const baseUrl = new URL(inject('serverUrl'))
const token = inject('apiToken')

type Fetch = typeof globalThis.fetch
type CallResult = Awaited<ReturnType<Client['callTool']>>

interface Written {
  drawingId: string
  revision: number
  created?: string[]
  updated?: string[]
  deleted?: string[]
}

const clients: Client[] = []
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()))
})

function repository(fetch: Fetch = withBearer(globalThis.fetch, token)) {
  return new HttpDrawingRepository({ baseUrl, fetch })
}

async function connect(repo: DrawingRepository): Promise<Client> {
  const handler = createMcpHandler(() => createServer(repo, { baseUrl }))
  const transport = new StreamableHTTPClientTransport(
    new URL('http://mcp.test/mcp'),
    { fetch: (url, init) => handler.fetch(new Request(url, init)) },
  )
  const client = new Client(
    { name: 'server-test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  await client.connect(transport)
  clients.push(client)
  return client
}

function textOf(result: CallResult): string {
  const [block] = result.content as { type: string; text: string }[]
  expect(block.type).toBe('text')
  return block.text
}

function written(result: CallResult): Written {
  expect(result.isError, textOf(result)).toBeFalsy()
  return result.structuredContent as unknown as Written
}

describe('MCP tools against the Go server', async () => {
  const client = await connect(repository())
  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args })

  let drawingId = ''
  let revision = 0

  it('creates a drawing that list_drawings and get_drawing see', async () => {
    const out = written(
      await call('create_drawing', {
        name: 'Integration sketch',
        elements: [
          {
            type: 'rectangle',
            id: 'a',
            x: 0,
            y: 0,
            width: 120,
            height: 60,
            label: 'Sign in',
          },
          { type: 'rectangle', id: 'b', x: 240, y: 0, width: 120, height: 60 },
        ],
      }),
    )
    expect(out.created).toEqual(['a', 'b'])
    ;({ drawingId, revision } = out)

    expect(textOf(await call('list_drawings', {}))).toContain(drawingId)
    const outline = textOf(await call('get_drawing', { id: drawingId }))
    expect(outline).toContain('Sign in')
    expect(outline).toContain(`rev ${revision})`)
  })

  it('adds, updates, connects and deletes at the latest revision', async () => {
    const added = written(
      await call('add_elements', {
        drawingId,
        revision,
        elements: [{ type: 'text', id: 't', x: 0, y: 120, text: 'temp' }],
      }),
    )
    expect(added).toMatchObject({ revision: revision + 1, created: ['t'] })

    const updated = written(
      await call('update_elements', {
        drawingId,
        revision: added.revision,
        patches: [{ id: 'b', label: 'Dashboard' }],
      }),
    )
    expect(updated.updated).toEqual(['b'])

    const connected = written(
      await call('connect', {
        drawingId,
        revision: updated.revision,
        connections: [{ from: 'a', to: 'b', id: 'a-b' }],
      }),
    )
    expect(connected.created).toEqual(['a-b'])

    const deleted = written(
      await call('delete_elements', {
        drawingId,
        revision: connected.revision,
        ids: ['t'],
      }),
    )
    expect(deleted).toMatchObject({ revision: revision + 4, deleted: ['t'] })
    revision = deleted.revision

    const stored = await repository().getWithRevision(drawingId)
    expect(stored?.revision).toBe(revision)
    expect(stored?.doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'a-b'])
    expect(stored?.doc.elements.find((e) => e.id === 'a-b')).toMatchObject({
      type: 'arrow',
      startBinding: { elementId: 'a' },
      endBinding: { elementId: 'b' },
    })
  })

  it("finds the drawing by its text through the server's search index", async () => {
    const result = await call('search_drawings', { query: 'dashboard' })
    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toContain(drawingId)
  })

  it('renders the drawing as PNG and SVG', async () => {
    const png = await call('render_drawing', { id: drawingId })
    const pngBlocks = png.content as { type: string; data?: string }[]
    expect(pngBlocks.map((b) => b.type)).toEqual(['text', 'image'])
    const bytes = Buffer.from(pngBlocks[1]!.data!, 'base64')
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')

    const svg = await call('render_drawing', { id: drawingId, format: 'svg' })
    const svgBlocks = svg.content as { type: string; data?: string }[]
    const markup = Buffer.from(svgBlocks[1]!.data!, 'base64').toString('utf8')
    expect(markup).toContain('<svg')
    expect(markup).toContain('Dashboard')
  })

  it('lays out a login-flow diagram with bound arrows', async () => {
    const out = written(
      await call('create_diagram', {
        name: 'Login flow',
        direction: 'TB',
        nodes: [
          { id: 'form', label: 'Login form' },
          { id: 'check', label: 'Credentials valid?', shape: 'diamond' },
          { id: 'home', label: 'Home', shape: 'ellipse' },
          { id: 'error', label: 'Show error' },
        ],
        edges: [
          { from: 'form', to: 'check' },
          { from: 'check', to: 'home', label: 'yes', id: 'yes' },
          { from: 'check', to: 'error', label: 'no', id: 'no' },
          { from: 'error', to: 'form' },
        ],
      }),
    )
    expect(out.created).toEqual(
      expect.arrayContaining(['form', 'check', 'home', 'error', 'yes', 'no']),
    )
    const stored = await repository().getWithRevision(out.drawingId)
    expect(stored?.doc.name).toBe('Login flow')
    expect(stored?.doc.elements.find((e) => e.id === 'yes')).toMatchObject({
      type: 'arrow',
      startBinding: { elementId: 'check' },
      endBinding: { elementId: 'home' },
    })
    expect(textOf(await call('get_drawing', { id: out.drawingId }))).toContain(
      'Credentials valid?',
    )
  })

  it('stores a document the app can open', async () => {
    const response = await fetch(
      new URL(`api/drawings/${drawingId}`, baseUrl),
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toBe(`"${revision}"`)
    const doc = (await response.json()) as Record<string, unknown>
    expect(doc).toMatchObject({ id: drawingId, name: 'Integration sketch' })
    expect(typeof doc.schemaVersion).toBe('number')
  })

  it("turns the server's 412 into a conflict and keeps the other save", async () => {
    // Another writer (the editor) saves after the tool reads the drawing but
    // before its PUT reaches the server, so only If-Match can catch it.
    const other = repository()
    let raced = false
    const authed = withBearer(globalThis.fetch, token)
    const racing: Fetch = async (input, init) => {
      const path = new URL(String(input)).pathname
      if (
        !raced &&
        init?.method === 'PUT' &&
        path.endsWith(`/api/drawings/${drawingId}`)
      ) {
        raced = true
        const found = await other.getWithRevision(drawingId)
        await other.save(
          { ...found!.doc, name: 'Renamed by the editor' },
          { expectedRevision: found!.revision },
        )
      }
      return authed(input, init)
    }
    const racer = await connect(repository(racing))

    const result = await racer.callTool({
      name: 'add_elements',
      arguments: {
        drawingId,
        revision,
        elements: [{ type: 'text', x: 0, y: 200, text: 'late' }],
      },
    })
    expect(raced).toBe(true)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(
      `changed since revision ${revision} (it is now at revision ${revision + 1})`,
    )

    const stored = await other.getWithRevision(drawingId)
    expect(stored?.revision).toBe(revision + 1)
    expect(stored?.doc.name).toBe('Renamed by the editor')
    expect(stored?.doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'a-b'])
  })

  it('reports a wrong token without echoing it', async () => {
    const wrong = 'wrong-token-0123456789abcdef0123456789'
    const stranger = await connect(
      repository(withBearer(globalThis.fetch, wrong)),
    )
    const result = await stranger.callTool({
      name: 'list_drawings',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('(401): the API token is missing or wrong')
    expect(textOf(result)).not.toContain(wrong)
  })
})
