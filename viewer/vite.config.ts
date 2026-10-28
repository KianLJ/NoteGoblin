import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/**
 * The read-only phone viewer — built into the relay's static assets
 * (relay/viewer-dist/viewer/) and served by the same worker at /viewer/, so
 * every API call is same-origin. Reuses the desktop renderer's note
 * markdown, statblock, and theme code directly.
 */
export default defineConfig({
  root: here('.'),
  base: '/viewer/',
  publicDir: here('./public'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@shared', replacement: here('../shared') },
      { find: '@renderer', replacement: here('../src/renderer/src') },
      // The real sfxLibrary eagerly bundles every soundboard MP3 (hundreds of
      // MB) — markdown.ts only uses it to recognise `oneshot:` cue buttons,
      // which a read-only phone view has no way to play anyway.
      { find: /^\.\/data\/sfxLibrary$/, replacement: here('./src/stubs/sfxLibrary.ts') }
    ]
  },
  // `npm run viewer:dev` talks to the real relay (or NOTEGOBLIN_RELAY_URL, e.g.
  // a local `npm run relay:dev`) through this proxy, keeping calls same-origin
  // exactly like the deployed build.
  server: {
    proxy: {
      '/parties': { target: process.env.NOTEGOBLIN_RELAY_URL ?? 'https://relay.notegoblin.uk', changeOrigin: true }
    }
  },
  build: {
    outDir: here('../relay/viewer-dist/viewer'),
    emptyOutDir: true
  }
})
