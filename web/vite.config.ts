import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))
const version = (JSON.parse(readFileSync(here('../package.json'), 'utf8')) as { version: string }).version

/**
 * The web app (web/main.tsx): the desktop renderer, built into the relay's static assets (relay/viewer-dist/app/)
 * and served at /app/ by the same worker, so its relay calls are same-origin. `electron` and `ws` are swapped for
 * browser stand-ins, and the relay's address is the page's own.
 */
export default defineConfig({
  root: here('.'),
  base: '/app/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: [
      { find: '@renderer', replacement: here('../src/renderer/src') },
      { find: '@shared', replacement: here('../shared') },
      { find: /^(\.\/|@server\/relay\/)relayConfig$/, replacement: here('./relayConfig.ts') },
      { find: '@server', replacement: here('../src/server') },
      { find: /^electron$/, replacement: here('./electron.ts') },
      { find: /^ws$/, replacement: here('./ws.ts') }
    ]
  },
  // `npm run web:dev` talks to the real relay (or NOTEGOBLIN_RELAY_URL) through this proxy, websockets included.
  server: {
    port: 5195,
    strictPort: true,
    proxy: {
      '/parties': { target: process.env.NOTEGOBLIN_RELAY_URL ?? 'https://relay.notegoblin.uk', changeOrigin: true, ws: true },
      // The built-in music, ambience and Sound Board audio, streamed (relay/src/audio.ts).
      '/library': { target: process.env.NOTEGOBLIN_RELAY_URL ?? 'https://relay.notegoblin.uk', changeOrigin: true }
    }
  },
  build: {
    outDir: here('../relay/viewer-dist/app'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000
  }
})
