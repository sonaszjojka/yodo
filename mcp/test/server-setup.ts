// Vitest global setup for `npm run test:server` (5.9): the same throwaway Go
// server as web's contract suite (ADR 0031), started with an API token so the
// MCP tools reach it the way an agent does (ADR 0063).

import type { TestProject } from 'vitest/node'
import { startServer } from '../../web/test/go-server.ts'

/** A fixed test token: the server wants at least 32 characters. */
const API_TOKEN = 'mcp-integration-test-token-0123456789abcdef'

export default async function setup(project: TestProject) {
  const { url, stop } = await startServer({ YODO_API_TOKEN: API_TOKEN })
  project.provide('serverUrl', url)
  project.provide('apiToken', API_TOKEN)
  return stop
}
