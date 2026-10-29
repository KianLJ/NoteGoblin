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
      // MB); the viewer's keeps only the two cues the roll popup plays. The
      // dice log and Sound Board engine broadcast to a session over the
      // desktop's IPC — the viewer's versions roll and play locally only.
      // RollAnimationOverlay.tsx itself is used unchanged.
      { find: /^.*\/data\/sfxLibrary$/, replacement: here('./src/stubs/sfxLibrary.ts') },
      { find: /^.*\/audio\/sfxBoardEngine$/, replacement: here('./src/stubs/sfxBoardEngine.ts') },
      { find: /^\.\/diceLogStore$/, replacement: here('./src/stubs/diceLogStore.ts') }
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
