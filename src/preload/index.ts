import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../../shared/ipc'

const api: AppApi = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  identity: {
    hasAny: () => ipcRenderer.invoke('identity:has-any'),
    create: (displayName, password) => ipcRenderer.invoke('identity:create', displayName, password),
    login: (displayName, password) => ipcRenderer.invoke('identity:login', displayName, password)
  },
  hosting: {
    start: () => ipcRenderer.invoke('hosting:start'),
    stop: () => ipcRenderer.invoke('hosting:stop'),
    status: () => ipcRenderer.invoke('hosting:status')
  },
  connections: {
    probe: (address) => ipcRenderer.invoke('connections:probe', address),
    join: (address, label) => ipcRenderer.invoke('connections:join', address, label),
    list: () => ipcRenderer.invoke('connections:list'),
    forget: (address) => ipcRenderer.invoke('connections:forget', address),
    decodeInvite: (code) => ipcRenderer.invoke('connections:decode-invite', code)
  }
}

contextBridge.exposeInMainWorld('goblin', api)
