// Values the `test:server` global setup provides to the tests (ADR 0031).
// Included by both tsconfigs: `server-setup.ts` provides them (Node) and
// `*.server-test.ts` injects them (app).
import 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The running Go server's root URL, ending in `/`. */
    serverUrl: string
  }
}
