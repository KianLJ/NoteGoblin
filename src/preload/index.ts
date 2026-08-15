import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, PresenceUpdate } from '../../shared/ipc'

const api: AppApi = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  identity: {
    hasAny: () => ipcRenderer.invoke('identity:has-any'),
    create: (displayName, password) => ipcRenderer.invoke('identity:create', displayName, password),
    login: (displayName, password) => ipcRenderer.invoke('identity:login', displayName, password),
    getCurrent: () => ipcRenderer.invoke('identity:get-current'),
    updateDisplayName: (newDisplayName) => ipcRenderer.invoke('identity:update-display-name', newDisplayName),
    changePassword: (currentPassword, newPassword) =>
      ipcRenderer.invoke('identity:change-password', currentPassword, newPassword),
    hasRemembered: () => ipcRenderer.invoke('identity:has-remembered'),
    autoLogin: () => ipcRenderer.invoke('identity:auto-login'),
    remember: (remember) => ipcRenderer.invoke('identity:remember', remember)
  },
  hosting: {
    start: () => ipcRenderer.invoke('hosting:start'),
    stop: () => ipcRenderer.invoke('hosting:stop'),
    status: () => ipcRenderer.invoke('hosting:status'),
    selfAddress: () => ipcRenderer.invoke('hosting:self-address')
  },
  connections: {
    probe: (address) => ipcRenderer.invoke('connections:probe', address),
    join: (address, label) => ipcRenderer.invoke('connections:join', address, label),
    list: () => ipcRenderer.invoke('connections:list'),
    forget: (address) => ipcRenderer.invoke('connections:forget', address),
    decodeInvite: (code) => ipcRenderer.invoke('connections:decode-invite', code)
  },
  campaigns: {
    list: (address) => ipcRenderer.invoke('campaigns:list', address),
    create: (name, address) => ipcRenderer.invoke('campaigns:create', name, address),
    join: (campaignId, address) => ipcRenderer.invoke('campaigns:join', campaignId, address)
  },
  notes: {
    list: (campaignId, address) => ipcRenderer.invoke('notes:list', campaignId, address),
    create: (campaignId, input, address) =>
      ipcRenderer.invoke('notes:create', campaignId, input, address),
    update: (campaignId, noteId, input, address) =>
      ipcRenderer.invoke('notes:update', campaignId, noteId, input, address),
    remove: (campaignId, noteId, address) =>
      ipcRenderer.invoke('notes:remove', campaignId, noteId, address)
  },
  folders: {
    list: (campaignId, address) => ipcRenderer.invoke('folders:list', campaignId, address),
    create: (campaignId, input, address) =>
      ipcRenderer.invoke('folders:create', campaignId, input, address),
    update: (campaignId, folderId, input, address) =>
      ipcRenderer.invoke('folders:update', campaignId, folderId, input, address),
    remove: (campaignId, folderId, address) =>
      ipcRenderer.invoke('folders:remove', campaignId, folderId, address)
  },
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    create: (name) => ipcRenderer.invoke('characters:create', name),
    update: (id, input) => ipcRenderer.invoke('characters:update', id, input),
    remove: (id) => ipcRenderer.invoke('characters:remove', id)
  },
  presence: {
    subscribe: (address, campaignId) => ipcRenderer.invoke('presence:subscribe', address, campaignId),
    selectCharacter: (address, characterName) =>
      ipcRenderer.invoke('presence:select-character', address, characterName),
    onUpdate: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: PresenceUpdate): void => callback(update)
      ipcRenderer.on('ws:presence', listener)
      return () => ipcRenderer.removeListener('ws:presence', listener)
    }
  },
  files: {
    pickImage: () => ipcRenderer.invoke('files:pick-image')
  }
}

contextBridge.exposeInMainWorld('goblin', api)
