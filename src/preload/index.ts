import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, CampaignChangeEvent, PlayerCharacterUpdate, PresenceUpdate } from '../../shared/ipc'

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
    remember: (remember) => ipcRenderer.invoke('identity:remember', remember),
    list: () => ipcRenderer.invoke('identity:list'),
    switch: (id, password, remember) => ipcRenderer.invoke('identity:switch', id, password, remember),
    forgetSaved: (id) => ipcRenderer.invoke('identity:forget-saved', id)
  },
  sessions: {
    start: () => ipcRenderer.invoke('sessions:start'),
    stop: () => ipcRenderer.invoke('sessions:stop'),
    status: () => ipcRenderer.invoke('sessions:status'),
    invite: (friendUserId) => ipcRenderer.invoke('sessions:invite', friendUserId),
    join: (sessionId) => ipcRenderer.invoke('sessions:join', sessionId),
    leave: () => ipcRenderer.invoke('sessions:leave'),
    onDisconnected: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { reason: 'dm-left' | 'connection-lost' }): void =>
        callback(payload.reason)
      ipcRenderer.on('session:disconnected', listener)
      return () => ipcRenderer.removeListener('session:disconnected', listener)
    }
  },
  campaigns: {
    list: (sessionId) => ipcRenderer.invoke('campaigns:list', sessionId),
    create: (name, sessionId) => ipcRenderer.invoke('campaigns:create', name, sessionId),
    join: (campaignId, sessionId) => ipcRenderer.invoke('campaigns:join', campaignId, sessionId),
    getActive: (sessionId) => ipcRenderer.invoke('campaigns:get-active', sessionId),
    setActive: (campaignId, sessionId) => ipcRenderer.invoke('campaigns:set-active', campaignId, sessionId),
    joinActive: (sessionId) => ipcRenderer.invoke('campaigns:join-active', sessionId),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: CampaignChangeEvent): void => callback(update)
      ipcRenderer.on('ws:campaign-changed', listener)
      return () => ipcRenderer.removeListener('ws:campaign-changed', listener)
    }
  },
  notes: {
    list: (campaignId, sessionId) => ipcRenderer.invoke('notes:list', campaignId, sessionId),
    create: (campaignId, input, sessionId) =>
      ipcRenderer.invoke('notes:create', campaignId, input, sessionId),
    update: (campaignId, noteId, input, sessionId) =>
      ipcRenderer.invoke('notes:update', campaignId, noteId, input, sessionId),
    remove: (campaignId, noteId, sessionId) =>
      ipcRenderer.invoke('notes:remove', campaignId, noteId, sessionId)
  },
  folders: {
    list: (campaignId, sessionId) => ipcRenderer.invoke('folders:list', campaignId, sessionId),
    create: (campaignId, input, sessionId) =>
      ipcRenderer.invoke('folders:create', campaignId, input, sessionId),
    update: (campaignId, folderId, input, sessionId) =>
      ipcRenderer.invoke('folders:update', campaignId, folderId, input, sessionId),
    remove: (campaignId, folderId, sessionId) =>
      ipcRenderer.invoke('folders:remove', campaignId, folderId, sessionId)
  },
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    create: (name, sheet) => ipcRenderer.invoke('characters:create', name, sheet),
    update: (id, input) => ipcRenderer.invoke('characters:update', id, input),
    remove: (id) => ipcRenderer.invoke('characters:remove', id),
    syncSelected: (sessionId, character) => ipcRenderer.invoke('characters:sync-selected', sessionId, character),
    onPlayerCharacterChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: PlayerCharacterUpdate): void => callback(update)
      ipcRenderer.on('ws:player-character', listener)
      return () => ipcRenderer.removeListener('ws:player-character', listener)
    }
  },
  presence: {
    subscribe: (sessionId, campaignId) => ipcRenderer.invoke('presence:subscribe', sessionId, campaignId),
    selectCharacter: (sessionId, characterName) =>
      ipcRenderer.invoke('presence:select-character', sessionId, characterName),
    onUpdate: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: PresenceUpdate): void => callback(update)
      ipcRenderer.on('ws:presence', listener)
      return () => ipcRenderer.removeListener('ws:presence', listener)
    }
  },
  relay: {
    status: () => ipcRenderer.invoke('relay:status'),
    myUserId: () => ipcRenderer.invoke('relay:my-user-id'),
    friends: {
      list: () => ipcRenderer.invoke('relay:friends:list'),
      listRequests: () => ipcRenderer.invoke('relay:friends:list-requests'),
      sendRequest: (username) => ipcRenderer.invoke('relay:friends:send-request', username),
      accept: (userId) => ipcRenderer.invoke('relay:friends:accept', userId),
      decline: (userId) => ipcRenderer.invoke('relay:friends:decline', userId),
      remove: (userId) => ipcRenderer.invoke('relay:friends:remove', userId)
    },
    onFriendsChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on('relay:friends-changed', listener)
      return () => ipcRenderer.removeListener('relay:friends-changed', listener)
    },
    notifications: {
      list: () => ipcRenderer.invoke('relay:notifications:list'),
      markRead: (id) => ipcRenderer.invoke('relay:notifications:mark-read', id)
    },
    onNotificationsChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on('relay:notifications-changed', listener)
      return () => ipcRenderer.removeListener('relay:notifications-changed', listener)
    }
  },
  files: {
    pickImage: () => ipcRenderer.invoke('files:pick-image')
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('goblin', api)
