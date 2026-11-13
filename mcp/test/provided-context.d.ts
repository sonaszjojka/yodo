// Values the `test:server` global setup provides to the tests (5.9).
import 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The running Go server's root URL, ending in `/`. */
    serverUrl: string
    /** The server's YODO_API_TOKEN. */
    apiToken: string
  }
}
