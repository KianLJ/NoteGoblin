import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppApi,
  CampaignChangeEvent,
  ForceRollRequest,
  InitiativeUpdate,
  MessageUpdate,
  PlayerCharacterUpdate,
  PlayerInitiativeUpdate,
  PresenceUpdate,
  SceneChangedUpdate
} from '../../shared/ipc'
import type { DiceRollLogEntry } from '../../shared/dice'
import type { RelayMessage } from '../../shared/relay'

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
    forgetSaved: (id) => ipcRenderer.invoke('identity:forget-saved', id),
    signOut: () => ipcRenderer.invoke('identity:sign-out'),
    pullPrefs: () => ipcRenderer.invoke('identity:pull-prefs'),
    pushPrefs: (prefs) => ipcRenderer.invoke('identity:push-prefs', prefs),
    onPrefsChecked: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, prefs: unknown): void => callback(prefs)
      ipcRenderer.on('relay:prefs-checked', listener)
      return () => ipcRenderer.removeListener('relay:prefs-checked', listener)
    }
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
    rename: (campaignId, name) => ipcRenderer.invoke('campaigns:rename', campaignId, name),
    delete: (campaignId) => ipcRenderer.invoke('campaigns:delete', campaignId),
    join: (campaignId, sessionId) => ipcRenderer.invoke('campaigns:join', campaignId, sessionId),
    getActive: (sessionId) => ipcRenderer.invoke('campaigns:get-active', sessionId),
    setActive: (campaignId, sessionId) => ipcRenderer.invoke('campaigns:set-active', campaignId, sessionId),
    joinActive: (sessionId) => ipcRenderer.invoke('campaigns:join-active', sessionId),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: CampaignChangeEvent): void => callback(update)
      ipcRenderer.on('ws:campaign-changed', listener)
      return () => ipcRenderer.removeListener('ws:campaign-changed', listener)
    },
    onActiveChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on('ws:active-campaign-changed', listener)
      return () => ipcRenderer.removeListener('ws:active-campaign-changed', listener)
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
  calendar: {
    get: (campaignId, sessionId) => ipcRenderer.invoke('calendar:get', campaignId, sessionId),
    save: (campaignId, config, sessionId) => ipcRenderer.invoke('calendar:save', campaignId, config, sessionId),
    remove: (campaignId, sessionId) => ipcRenderer.invoke('calendar:remove', campaignId, sessionId)
  },
  sessionDecks: {
    list: (campaignId, sessionId) => ipcRenderer.invoke('sessionDecks:list', campaignId, sessionId),
    create: (campaignId, title, sessionId) => ipcRenderer.invoke('sessionDecks:create', campaignId, title, sessionId),
    update: (campaignId, deckId, input, sessionId) =>
      ipcRenderer.invoke('sessionDecks:update', campaignId, deckId, input, sessionId),
    remove: (campaignId, deckId, sessionId) => ipcRenderer.invoke('sessionDecks:remove', campaignId, deckId, sessionId),
    addScene: (campaignId, deckId, title, sessionId) => ipcRenderer.invoke('sessionDecks:addScene', campaignId, deckId, title, sessionId),
    removeScene: (campaignId, deckId, noteId, sessionId) =>
      ipcRenderer.invoke('sessionDecks:removeScene', campaignId, deckId, noteId, sessionId),
    getLive: (campaignId, sessionId) => ipcRenderer.invoke('sessionDecks:getLive', campaignId, sessionId),
    present: (campaignId, deckId) => ipcRenderer.invoke('sessionDecks:present', campaignId, deckId),
    setScene: (sceneIndex) => ipcRenderer.invoke('sessionDecks:setScene', sceneIndex),
    stopPresenting: () => ipcRenderer.invoke('sessionDecks:stopPresenting'),
    onSceneChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: SceneChangedUpdate): void => callback(update)
      ipcRenderer.on('ws:scene-changed', listener)
      return () => ipcRenderer.removeListener('ws:scene-changed', listener)
    }
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
  messages: {
    list: (campaignId, sessionId) => ipcRenderer.invoke('messages:list', campaignId, sessionId),
    send: (campaignId, input, sessionId) => ipcRenderer.invoke('messages:send', campaignId, input, sessionId),
    onMessage: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: MessageUpdate): void => callback(update.message)
      ipcRenderer.on('ws:message', listener)
      return () => ipcRenderer.removeListener('ws:message', listener)
    }
  },
  snapshots: {
    list: () => ipcRenderer.invoke('snapshots:list'),
    get: (campaignId) => ipcRenderer.invoke('snapshots:get', campaignId),
    save: (campaign, notes, folders, sessionDecks) => ipcRenderer.invoke('snapshots:save', campaign, notes, folders, sessionDecks),
    remove: (campaignId) => ipcRenderer.invoke('snapshots:remove', campaignId)
  },
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    create: (name, sheet) => ipcRenderer.invoke('characters:create', name, sheet),
    update: (id, input) => ipcRenderer.invoke('characters:update', id, input),
    remove: (id) => ipcRenderer.invoke('characters:remove', id),
    syncSelected: (sessionId, character) => ipcRenderer.invoke('characters:sync-selected', sessionId, character),
    getPlayerCharacter: (userId) => ipcRenderer.invoke('characters:get-player-character', userId),
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
  initiative: {
    broadcast: (state) => ipcRenderer.invoke('initiative:broadcast', state),
    onUpdate: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: InitiativeUpdate): void => callback(update)
      ipcRenderer.on('ws:initiative', listener)
      return () => ipcRenderer.removeListener('ws:initiative', listener)
    },
    setMine: (initiative) => ipcRenderer.invoke('initiative:set-mine', initiative),
    onPlayerSet: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, update: PlayerInitiativeUpdate): void => callback(update)
      ipcRenderer.on('ws:player-initiative', listener)
      return () => ipcRenderer.removeListener('ws:player-initiative', listener)
    }
  },
  dice: {
    broadcast: (sessionId, roll) => ipcRenderer.invoke('dice:broadcast', sessionId, roll),
    onRoll: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, roll: DiceRollLogEntry): void => callback(roll)
      ipcRenderer.on('ws:dice-roll', listener)
      return () => ipcRenderer.removeListener('ws:dice-roll', listener)
    },
    forceRoll: (sessionId, targetUserId, request) => ipcRenderer.invoke('dice:force-roll', sessionId, targetUserId, request),
    onForceRoll: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: ForceRollRequest): void => callback(request)
      ipcRenderer.on('ws:force-roll', listener)
      return () => ipcRenderer.removeListener('ws:force-roll', listener)
    }
  },
  music: {
    broadcast: (trackId, fadeMs) => ipcRenderer.invoke('music:broadcast', trackId, fadeMs),
    onChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        update: { trackId: string | null; fadeMs: number; customTrack?: { title: string; mimeType: string; dataBase64: string } }
      ): void => callback(update)
      ipcRenderer.on('ws:music-changed', listener)
      return () => ipcRenderer.removeListener('ws:music-changed', listener)
    },
    broadcastVolume: (volume) => ipcRenderer.invoke('music:broadcast-volume', volume),
    onVolumeChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, volume: number): void => callback(volume)
      ipcRenderer.on('ws:music-volume-changed', listener)
      return () => ipcRenderer.removeListener('ws:music-volume-changed', listener)
    },
    listCustom: () => ipcRenderer.invoke('music:list-custom'),
    addCustomTrack: (groupId) => ipcRenderer.invoke('music:add-custom-track', groupId),
    removeCustomTrack: (groupId, trackId) => ipcRenderer.invoke('music:remove-custom-track', groupId, trackId)
  },
  ambient: {
    broadcast: (groupId, layerId, level, fadeMs) => ipcRenderer.invoke('ambient:broadcast', groupId, layerId, level, fadeMs),
    onChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        update: { groupId: string; layerId: string; level: number; fadeMs: number }
      ): void => callback(update)
      ipcRenderer.on('ws:ambient-level-changed', listener)
      return () => ipcRenderer.removeListener('ws:ambient-level-changed', listener)
    }
  },
  sfxBoard: {
    broadcast: (sfxId) => ipcRenderer.invoke('sfx-board:broadcast', sfxId),
    onPlay: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, sfxId: string): void => callback(sfxId)
      ipcRenderer.on('ws:sfx-played', listener)
      return () => ipcRenderer.removeListener('ws:sfx-played', listener)
    }
  },
  sfxEntity: {
    listCustom: () => ipcRenderer.invoke('sfx-entity:list-custom'),
    setCustom: (entityKey) => ipcRenderer.invoke('sfx-entity:set-custom', entityKey),
    removeCustom: (entityKey) => ipcRenderer.invoke('sfx-entity:remove-custom', entityKey)
  },
  discord: {
    setActivity: (details) => ipcRenderer.invoke('discord:set-activity', details)
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
    },
    messages: {
      send: (input) => ipcRenderer.invoke('relay:messages:send', input),
      list: (withUserId, kind) => ipcRenderer.invoke('relay:messages:list', withUserId, kind),
      whisperThreads: () => ipcRenderer.invoke('relay:messages:whisper-threads'),
      onMessage: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, message: RelayMessage): void => callback(message)
        ipcRenderer.on('relay:message', listener)
        return () => ipcRenderer.removeListener('relay:message', listener)
      },
      markRead: (fromUserId, kind) => ipcRenderer.invoke('relay:messages:mark-read', fromUserId, kind)
    },
    admin: {
      listAccounts: () => ipcRenderer.invoke('relay:admin:list-accounts'),
      removeAccount: (userId) => ipcRenderer.invoke('relay:admin:remove-account', userId),
      updateAccount: (userId, input) => ipcRenderer.invoke('relay:admin:update-account', userId, input)
    }
  },
  files: {
    pickImage: () => ipcRenderer.invoke('files:pick-image'),
    getVaultPath: () => ipcRenderer.invoke('files:get-vault-path'),
    chooseVaultFolder: () => ipcRenderer.invoke('files:choose-vault-folder')
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
