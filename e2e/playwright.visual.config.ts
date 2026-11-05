import { defineConfig, devices } from '@playwright/test'

// The export visual baseline (roadmap 2.7c, ADR 0044). Baselines are only
// valid in the pinned Playwright image they were made in, so run this with
// `npm run test:visual` (Docker) or in CI's `visual` job, not directly.
const PORT = 4183

export default defineConfig({
  testDir: './visual',
  testMatch: '*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // One folder, no platform suffix: there is exactly one environment.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toMatchSnapshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${PORT}/yodo/`,
  },
  webServer: {
    command: `node scripts/serve-dist.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/yodo/`,
    reuseExistingServer: false,
  },
})
