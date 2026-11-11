import { defineConfig } from 'vitest/config'

// One Node file (ADR 0061): an SSR build that bundles every import, including
// the SDK, zod, rough.js, the fonts and the shared web/src modules. The one
// exception is `@napi-rs/canvas`, a native addon with a binary per platform,
// which stays a runtime dependency that npm installs (ADR 0065).
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    // The bundle carries third-party code (the SDK, zod, …), so their licenses
    // ship beside it (ADR 0061, Consequences).
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
    rolldownOptions: {
      output: {
        format: 'es',
        entryFileNames: 'index.js',
        banner: '#!/usr/bin/env node',
      },
    },
  },
  ssr: {
    target: 'node',
    noExternal: true,
    external: ['@napi-rs/canvas'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
