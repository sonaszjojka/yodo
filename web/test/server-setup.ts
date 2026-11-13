// Vitest global setup for `npm run test:server` (ADR 0031): starts the Go
// server (`startServer` in go-server.ts, shared with mcp/'s suite) and hands
// its URL to the tests through `provide('serverUrl')`.

import type { TestProject } from 'vitest/node'
import { startServer } from './go-server.ts'

export default async function setup(project: TestProject) {
  const { url, stop } = await startServer()
  project.provide('serverUrl', url)
  return stop
}
