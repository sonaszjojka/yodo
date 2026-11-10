import { defineConfig } from 'vitest/config'

// One self-contained Node file (ADR 0061): an SSR build that bundles every
// import, including the SDK, zod and the shared web/src modules, so the
// published package has no runtime dependencies.
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
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
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
