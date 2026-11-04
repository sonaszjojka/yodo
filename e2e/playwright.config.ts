import { defineConfig, devices } from '@playwright/test'
import type { ModeOptions } from './tests/fixtures.ts'

// Both usage modes, served from one build (ADR 0035). Run `npm test`, which
// builds the app first; `npx playwright test` alone reuses the last build.
const HOSTED_PORT = 4180
const SELF_HOSTED_PORT = 4181
const ci = !!process.env.CI

const modes = {
  // The GitHub Pages path, so the relative base (ADR 0007) is exercised.
  hosted: `http://127.0.0.1:${HOSTED_PORT}/yodo/`,
  'self-hosted': `http://127.0.0.1:${SELF_HOSTED_PORT}/`,
} as const

const browsers = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
}

export default defineConfig<ModeOptions>({
  testDir: './tests',
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: { trace: 'on-first-retry' },
  projects: Object.entries(modes).flatMap(([mode, baseURL]) =>
    Object.entries(browsers).map(([browser, device]) => ({
      name: `${mode}-${browser}`,
      use: { ...device, baseURL, mode: mode as ModeOptions['mode'] },
    })),
  ),
  // Never reuse a running server: a stray dev server must not stand in for
  // the one under test.
  webServer: [
    {
      // Its HTML fallback for api/health makes the app pick IndexedDB, as on
      // Pages (ADR 0031).
      command: `npx vite preview --base /yodo/ --host 127.0.0.1 --port ${HOSTED_PORT} --strictPort`,
      cwd: '../web',
      url: modes.hosted,
      reuseExistingServer: false,
    },
    {
      command: `node scripts/serve-server.ts ${SELF_HOSTED_PORT}`,
      url: `${modes['self-hosted']}api/health`,
      reuseExistingServer: false,
    },
  ],
})
