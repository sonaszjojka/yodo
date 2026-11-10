// Configuration from the environment. The MCP client (Claude Code, Cursor, …)
// starts this process and passes these variables (ADR 0061). `YODO_URL`
// picks a self-hosted server; without it, drawings are files (ADR 0064).

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface HttpConfig {
  backend: 'http'
  /** The Yodo app root the API lives under, always ending in `/`. */
  baseUrl: URL
  /** `YODO_API_TOKEN`, sent as a bearer token (ADR 0063); absent when unset. */
  token?: string
}

export interface FileConfig {
  backend: 'files'
  /** `YODO_MCP_DIR` as an absolute path; `~/Yodo` by default. */
  dir: string
}

export type Config = HttpConfig | FileConfig

/** Where `~` and relative paths in `YODO_MCP_DIR` point; injected by tests. */
export interface Paths {
  home: string
  cwd: string
}

/** A configuration problem the user must fix; printed to stderr at startup. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

function readDir(raw: string | undefined, { home, cwd }: Paths): string {
  const dir = raw?.trim()
  if (!dir) return join(home, 'Yodo')
  // MCP clients pass env values as written, so `~` isn't expanded by a shell.
  if (dir === '~') return home
  if (dir.startsWith('~/')) return join(home, dir.slice(2))
  return resolve(cwd, dir)
}

export function readConfig(
  env: Record<string, string | undefined>,
  paths: Paths = { home: homedir(), cwd: process.cwd() },
): Config {
  const raw = env.YODO_URL?.trim()
  const token = env.YODO_API_TOKEN?.trim()
  if (!raw) {
    if (token) {
      throw new ConfigError(
        'YODO_API_TOKEN is set but YODO_URL is not. Set YODO_URL to your ' +
          'self-hosted Yodo, or unset YODO_API_TOKEN to keep drawings in files.',
      )
    }
    return { backend: 'files', dir: readDir(env.YODO_MCP_DIR, paths) }
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

  return token
    ? { backend: 'http', baseUrl, token }
    : { backend: 'http', baseUrl }
}
