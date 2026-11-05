// Serves the built web app for the visual suite (ADR 0044): `web/dist` under
// `/yodo/`, the Pages path, with index.html as the fallback for unknown paths.
// That fallback makes the `api/health` probe fail, so the app picks IndexedDB
// as it does on Pages (ADR 0031). Needs neither Vite nor the Go server.
// Usage: node scripts/serve-dist.ts <port>

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const port = Number(process.argv[2])
if (!port) throw new Error('usage: serve-dist.ts <port>')

const dist = resolve(import.meta.dirname, '../../web/dist')
if (!existsSync(join(dist, 'index.html'))) {
  throw new Error(`${dist} has no build; run \`npm run build\` in web/`)
}
const PREFIX = '/yodo/'

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  if (!pathname.startsWith(PREFIX)) {
    response.writeHead(404).end()
    return
  }
  // normalize() on a rooted path stops `..` from climbing out of dist.
  const relative = normalize(
    `/${decodeURIComponent(pathname.slice(PREFIX.length))}`,
  )
  let file = join(dist, relative)
  if (!existsSync(file) || !statSync(file).isFile())
    file = join(dist, 'index.html')
  response.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
  })
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1')
