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
  /** `YODO_APP_URL`: the Yodo app open links point to (ADR 0069), ending in `/`. */
  appUrl: URL
}

/** The hosted app (ADR 0007), where open links point unless told otherwise. */
export const HOSTED_APP_URL = 'https://sonaszjojka.github.io/yodo/'

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

/** An http(s) app root: no query or fragment, and a path ending in `/`. */
function appRoot(name: string, raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`${name} is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an http or https URL: ${raw}`)
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  url.search = ''
  url.hash = ''
  return url
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
    return {
      backend: 'files',
      dir: readDir(env.YODO_MCP_DIR, paths),
      appUrl: appRoot(
        'YODO_APP_URL',
        env.YODO_APP_URL?.trim() || HOSTED_APP_URL,
      ),
    }
  }
  // API paths are relative (ADR 0007), so `/yodo` must become `/yodo/` for
  // `api/drawings` to resolve under it rather than replace its last segment.
  const baseUrl = appRoot('YODO_URL', raw)

  return token
    ? { backend: 'http', baseUrl, token }
    : { backend: 'http', baseUrl }
}
