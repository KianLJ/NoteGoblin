/// <reference types="vite/client" />

import type { AppApi } from '../../../shared/ipc'

declare global {
  interface Window {
    goblin: AppApi
  }
}
