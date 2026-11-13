import { defineConfig } from 'vitest/config'

// `npm run test:server`: the MCP tools against the real Go server (5.9, ADR
// 0031). Kept apart from `npm test` so the unit suite doesn't need Go.
export default defineConfig({
  test: {
    include: ['src/**/*.server-test.ts'],
    globalSetup: ['test/server-setup.ts'],
    // The global setup builds the Go binary first.
    hookTimeout: 120_000,
  },
})
