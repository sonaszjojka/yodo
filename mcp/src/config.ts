// Configuration from the environment. The MCP client (Claude Code, Cursor, …)
// starts this process and passes these variables (ADR 0061).

export interface Config {
  /** The Yodo app root the API lives under, always ending in `/`. */
  baseUrl: URL
  /** `YODO_API_TOKEN`, sent as a bearer token (ADR 0063); absent when unset. */
  token?: string
}

/** A configuration problem the user must fix; printed to stderr at startup. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const raw = env.YODO_URL?.trim()
  if (!raw) {
    throw new ConfigError(
      'YODO_URL is not set. Set it to your self-hosted Yodo, e.g. http://127.0.0.1:8080/',
    )
  }
  let baseUrl: URL
  try {
    baseUrl = new URL(raw)
  } catch {
    throw new ConfigError(`YODO_URL is not a valid URL: ${raw}`)
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new ConfigError(`YODO_URL must be an http or https URL: ${raw}`)
  }
  // API paths are relative (ADR 0007), so `/yodo` must become `/yodo/` for
  // `api/drawings` to resolve under it rather than replace its last segment.
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/'
  baseUrl.search = ''
  baseUrl.hash = ''

  const token = env.YODO_API_TOKEN?.trim()
  return token ? { baseUrl, token } : { baseUrl }
}
