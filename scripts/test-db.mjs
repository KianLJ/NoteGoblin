// Runs the database tests (tests/**/*.dbtest.ts) under Electron's own Node: better-sqlite3 is
// compiled for Electron by postinstall, so the system Node can't load it.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') // the path to the Electron binary, from outside Electron
const vitest = require.resolve('vitest/vitest.mjs')

const result = spawnSync(electron, [vitest, 'run', '--config', 'vitest.db.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status ?? 1)
