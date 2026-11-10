// A 2025-era client (one that opens with `initialize`) over InMemoryTransport,
// which carries 2025-era instances only (ADR 0061). Clients such as older
// Claude Desktop builds still speak this era.

import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'
import { createDocument } from '../../web/src/core/document/create.ts'
import { InMemoryDrawingRepository } from '../../web/src/storage/memory.ts'
import { createServer } from './server.ts'

describe('a 2025-era client', () => {
  it('initializes, lists the tools and calls one', async () => {
    const repo = new InMemoryDrawingRepository()
    await repo.save({ ...createDocument('Roadmap'), id: 'd1' })

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const methods: string[] = []
    const send = clientSide.send.bind(clientSide)
    clientSide.send = (message, options) => {
      if ('method' in message) methods.push(message.method)
      return send(message, options)
    }

    await createServer(repo).connect(serverSide)
    const client = new Client(
      { name: 'legacy-test', version: '0.0.0' },
      { versionNegotiation: { mode: 'legacy' } },
    )
    await client.connect(clientSide)
    try {
      // The 2025 handshake, not the stateless 2026-07-28 opening.
      expect(methods[0]).toBe('initialize')
      const { tools } = await client.listTools()
      expect(tools).toHaveLength(3)
      const result = await client.callTool({
        name: 'list_drawings',
        arguments: {},
      })
      const [block] = result.content as { type: string; text: string }[]
      expect(block.text).toMatch(
        /^1 drawing, newest first[^\n]*\nd1 {2}"Roadmap"/,
      )
    } finally {
      await client.close()
    }
  })
})
