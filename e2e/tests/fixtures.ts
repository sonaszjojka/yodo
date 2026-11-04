import { test as base } from '@playwright/test'

/** Which usage mode a project runs against (ADR 0031, 0035). */
export type Mode = 'hosted' | 'self-hosted'

export interface ModeOptions {
  mode: Mode
}

/** `test` with a per-project `mode` option, set in playwright.config.ts. */
export const test = base.extend<ModeOptions>({
  mode: ['hosted', { option: true }],
})

export { expect } from '@playwright/test'
