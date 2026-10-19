// Dev-only: serves the character sheet on its own in a plain browser, with
// window.goblin stubbed out (src/renderer/src/dev/sheetPreview.tsx), so the
// sheet's layout can be checked without starting Electron.
//   npx vite --config vite.sheet-preview.config.ts
// then open http://localhost:5180/sheet-preview.html. Not part of the app build.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('shared')
    }
  },
  plugins: [react()],
  server: { port: 5180, strictPort: true }
})
