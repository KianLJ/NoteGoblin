// The NoteGoblin web app: the desktop app's own screens in a browser, for players. In order: the web flag
// (src/renderer/src/platform.ts reads it), the stand-in for the main process answering the channels (host.ts), the
// desktop's preload building window.goblin on top of it (with `electron` swapped for web/electron.ts), then the app.
import './flag'
import './host'
import '../src/preload/index'
import '../src/renderer/src/main'
