// Lists the built-in music, ambience and Sound Board audio (src/renderer/src/assets/{music,ambient,soundboard})
// into src/renderer/src/data/audioManifest.json. The app ships that list, not the files: they're downloaded or
// streamed from the relay (see src/main/libraryAudio.ts), and `npm run library:upload` puts them there.
// Runs before every dev and build, so adding a file to one of those folders is all it takes.
import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'assets')
const out = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'data', 'audioManifest.json')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : name.toLowerCase().endsWith('.mp3') ? [full] : []
  })
}

const files = ['music', 'ambient', 'soundboard']
  .filter((folder) => existsSync(join(root, folder)))
  .flatMap((folder) => walk(join(root, folder)))
  .map((full) => ({ path: relative(root, full).split(sep).join('/'), size: statSync(full).size }))
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

const next = JSON.stringify({ files }, null, 1) + '\n'
// Compared without line endings: git may check it out with CRLF, and that's no change.
if (!existsSync(out) || readFileSync(out, 'utf-8').replace(/\r\n/g, '\n') !== next) writeFileSync(out, next)
const mb = (files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(1)
console.log(`audio manifest: ${files.length} files, ${mb} MB`)
