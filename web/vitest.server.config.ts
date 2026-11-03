import { defineConfig } from 'vitest/config'

// `npm run test:server`: the repository contract suite against the real Go
// server (ADR 0031). Kept apart from `npm test` so web tests don't need Go.
export default defineConfig({
  test: {
    include: ['src/**/*.server-test.ts'],
    globalSetup: ['test/server-setup.ts'],
  },
})
