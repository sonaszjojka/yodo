// Smoke test of the built bundle over real stdio (ADR 0061): spawns
// `node dist/index.js` as an MCP client would, once against a stub Yodo API
// that checks the bearer token, and once without YODO_URL over a folder of
// `.yodo` files (ADR 0064). Run after `npm run build`; exits non-zero on failure.

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The bundle carries third-party code, so its licenses ship beside it (ADR
// 0061); `files: ["dist"]` publishes both.
const licenses = readFileSync(
  new URL('../dist/THIRD_PARTY_LICENSES.md', import.meta.url),
  'utf8',
)
for (const name of ['@modelcontextprotocol/server', 'zod']) {
  assert.ok(licenses.includes(name), `THIRD_PARTY_LICENSES.md lacks ${name}`)
}

const TOKEN = 'smoke-test-token-0123456789abcdef'
const SUMMARY = {
  id: 'smoke-drawing',
  name: 'Smoke test',
  createdAt: 0,
  updatedAt: 0,
  revision: 1,
}

const api = createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end('unauthorized')
    return
  }
  if (req.method === 'GET' && req.url === '/api/drawings') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify([SUMMARY]))
    return
  }
  res.writeHead(404).end('not found')
})
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
const { port } = api.address() as AddressInfo

/** Starts the bundle with `env`, then runs `check` against it as a client. */
async function withBundle(
  env: Record<string, string>,
  check: (client: Client) => Promise<void>,
): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL('../dist/index.js', import.meta.url).pathname],
    env: { PATH: process.env.PATH ?? '', ...env },
    stderr: 'inherit',
  })
  const client = new Client(
    { name: 'yodo-mcp-smoke', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  try {
    await client.connect(transport)
    await check(client)
  } finally {
    await client.close()
  }
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  assert.notEqual(result.isError, true, JSON.stringify(result.content))
  const [block] = result.content as { type: string; text: string }[]
  return block.text
}

try {
  await withBundle(
    { YODO_URL: `http://127.0.0.1:${port}`, YODO_API_TOKEN: TOKEN },
    async (client) => {
      const { tools } = await client.listTools()
      assert.deepEqual(tools.map((t) => t.name).sort(), [
        'get_drawing',
        'list_drawings',
        'search_drawings',
      ])
      const text = textOf(
        await client.callTool({ name: 'list_drawings', arguments: {} }),
      )
      assert.match(text, /^smoke-drawing {2}"Smoke test"/m)
    },
  )
  console.log(
    'smoke: ok (3 tools; list_drawings reached the API with the token)',
  )
} finally {
  api.close()
}

// The file backend, over an app export dropped into the folder as `<id>.yodo`.
const EXPORT_ID = '6f1c2b9e-4d3a-4c8e-9b7a-1e2d3c4b5a60'
const dir = mkdtempSync(join(tmpdir(), 'yodo-mcp-smoke-'))
try {
  copyFileSync(
    new URL(
      '../../web/src/core/document/fixtures/v1-export.yodo',
      import.meta.url,
    ),
    join(dir, `${EXPORT_ID}.yodo`),
  )
  await withBundle({ YODO_MCP_DIR: dir }, async (client) => {
    const list = textOf(
      await client.callTool({ name: 'list_drawings', arguments: {} }),
    )
    assert.match(list, new RegExp(`^${EXPORT_ID} {2}"Every element"`, 'm'))
    const outline = textOf(
      await client.callTool({
        name: 'get_drawing',
        arguments: { id: EXPORT_ID },
      }),
    )
    assert.match(outline, /8 elements/)
  })
  console.log('smoke: ok (list_drawings and get_drawing read YODO_MCP_DIR)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
