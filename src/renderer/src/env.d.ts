/// <reference types="vite/client" />

import type { AppApi } from '../../../shared/ipc'

declare global {
  interface Window {
    goblin: AppApi
    /** Chromium's Local Font Access API — used to list actual installed system fonts for the font picker (see theme.ts). Not in TS's default DOM lib yet. */
    queryLocalFonts?: () => Promise<{ family: string }[]>
  }
}
