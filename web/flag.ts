// Imported first by web/main.tsx, so everything after knows it's the web app (src/renderer/src/platform.ts).
;(window as unknown as { __NG_WEB__: boolean }).__NG_WEB__ = true
document.documentElement.dataset.platform = 'web'
