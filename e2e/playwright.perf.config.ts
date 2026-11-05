import { defineConfig } from '@playwright/test'

// The performance benchmark (roadmap 2.12, ADR 0042). It runs on demand with
// `npm run perf`, never as part of `npm test` or CI: runners vary, and the
// target is a real Chrome on an Apple-silicon Mac (docs/product.md).
const PORT = 4182

export default defineConfig({
  testDir: './perf',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Frames are measured over seconds of input on a big board.
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // The system Chrome, headed, at a fixed size and pixel ratio, so numbers
    // are comparable from run to run. Each run records these.
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: `node scripts/serve-server.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
