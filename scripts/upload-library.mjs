// Uploads the built-in music, ambience and Sound Board audio (listed in src/renderer/src/data/audioManifest.json)
// to the relay's R2 bucket under library/<path as base64url> (see the relay's libraryKey), where the app streams and downloads them from. Only sends files that
// are new or changed since the last run (remembered in .library-upload.json). Run after changing the built-in
// audio, before releasing:  npm run library:upload
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(repo, 'src/renderer/src/data/audioManifest.json'), 'utf-8'))
const statePath = join(repo, process.argv.includes('--local') ? '.library-upload.local.json' : '.library-upload.json')
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf-8')) : {}
const wrangler = join(repo, 'relay/node_modules/wrangler/bin/wrangler.js')
const BUCKET = 'notegoblin-audio'
const PARALLEL = 6
// `--local` puts them in `wrangler dev`'s own bucket instead, for trying it out (with that run's --persist-to).
const TARGET = process.argv.includes('--local') ? ['--local', ...(process.env.PERSIST_TO ? ['--persist-to', process.env.PERSIST_TO] : [])] : ['--remote']

const todo = manifest.files.filter((f) => state[f.path] !== f.size)
console.log(`${todo.length} of ${manifest.files.length} files to upload`)

function put(file) {
  return new Promise((resolve) => {
    // No shell: the names have spaces and ampersands in them.
    const child = spawn(
      process.execPath,
      [wrangler, 'r2', 'object', 'put', `${BUCKET}/library/${Buffer.from(file.path, 'utf-8').toString('base64url')}`, '--file', join(repo, 'src/renderer/src/assets', file.path), '--content-type', 'audio/mpeg', ...TARGET],
      { cwd: join(repo, 'relay'), stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => resolve(code === 0 ? null : err.trim().split('\n').pop()))
  })
}

let done = 0
const failed = []
async function worker() {
  while (todo.length) {
    const file = todo.shift()
    // A few tries each: a busy connection (or, with --local, the local bucket) can refuse one now and then.
    let error = await put(file)
    for (let tries = 1; error && tries < 3; tries++) error = await put(file)
    done++
    if (error) failed.push(`${file.path}: ${error}`)
    else {
      state[file.path] = file.size
      writeFileSync(statePath, JSON.stringify(state, null, 1))
    }
    if (done % 10 === 0 || !todo.length) console.log(`  ${done} done${failed.length ? `, ${failed.length} failed` : ''}`)
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker))
if (failed.length) {
  console.error(`\n${failed.length} failed (run again to retry them):\n${failed.slice(0, 10).join('\n')}`)
  process.exit(1)
}
console.log('All uploaded.')
