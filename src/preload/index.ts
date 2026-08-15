import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../../shared/ipc'

const api: AppApi = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  identity: {
    hasAny: () => ipcRenderer.invoke('identity:has-any'),
    create: (displayName, password) => ipcRenderer.invoke('identity:create', displayName, password),
    login: (displayName, password) => ipcRenderer.invoke('identity:login', displayName, password)
  }
}

contextBridge.exposeInMainWorld('goblin', api)
