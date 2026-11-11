import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Tests that open a real host database. better-sqlite3 is built for Electron, not the system Node,
// so these run through Electron's own Node (`npm run test:db`, see scripts/test-db.mjs).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('shared'),
      '@server': resolve('src/server')
    }
  },
  test: {
    include: ['tests/**/*.dbtest.ts'],
    environment: 'node',
    // One process: getHostDb keeps a single database open per process.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
})
