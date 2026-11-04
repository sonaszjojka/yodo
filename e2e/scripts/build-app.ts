// `npm run build:app` (ADR 0035): builds web/dist once for both modes, copies
// it into the server's go:embed directory as the Dockerfile does (ADR 0019),
// and builds the server binary that `serve-server.ts` runs.

import { execFileSync } from 'node:child_process'
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const webDir = join(root, 'web')
const serverDir = join(root, 'server')
const embedDir = join(serverDir, 'internal/webui/dist')
const binary = resolve(import.meta.dirname, '../.bin/yodo')

function run(command: string, args: string[], cwd: string) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${cwd})`)
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

run('npm', ['run', 'build'], webDir)

// Replace the previous copy, keeping the tracked .gitkeep.
for (const entry of readdirSync(embedDir)) {
  if (entry !== '.gitkeep') {
    rmSync(join(embedDir, entry), { recursive: true, force: true })
  }
}
cpSync(join(webDir, 'dist'), embedDir, { recursive: true })

run('go', ['build', '-o', binary, './cmd/yodo'], serverDir)
