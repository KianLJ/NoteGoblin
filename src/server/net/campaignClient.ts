import { pinnedRequest } from './pinnedHttpClient'

export interface CampaignJson {
  id: string
  name: string
  dmUserId: string
  dmDisplayName: string
  createdAt: string
  myRole: 'dm' | 'player' | null
}

export interface NoteJson {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  title: string
  bodyMarkdown: string
  visibility: 'dm' | 'shared'
  folderId: string | null
  createdAt: string
  updatedAt: string
}

export interface FolderJson {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  name: string
  parentFolderId: string | null
  visibility: 'dm' | 'shared'
  createdAt: string
  updatedAt: string
}

type ClientResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(
  address: string,
  certPem: string,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<ClientResult<T>> {
  const res = await pinnedRequest(address, certPem, path, { method, body, token })
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, data: res.body as T }
  }
  const errorBody = res.body as { error?: string } | null
  return { ok: false, error: errorBody?.error ?? `Request failed (${res.status}).` }
}

export function listCampaigns(
  address: string,
  certPem: string,
  token: string
): Promise<ClientResult<{ campaigns: CampaignJson[] }>> {
  return call(address, certPem, token, 'GET', '/campaigns')
}

export function createCampaign(
  address: string,
  certPem: string,
  token: string,
  name: string
): Promise<ClientResult<{ campaign: CampaignJson }>> {
  return call(address, certPem, token, 'POST', '/campaigns', { name })
}

export function joinCampaign(
  address: string,
  certPem: string,
  token: string,
  campaignId: string
): Promise<ClientResult<{ campaign: CampaignJson }>> {
  return call(address, certPem, token, 'POST', `/campaigns/${campaignId}/join`)
}

export function getActiveCampaign(
  address: string,
  certPem: string,
  token: string
): Promise<ClientResult<{ campaign: CampaignJson | null }>> {
  return call(address, certPem, token, 'GET', '/active-campaign')
}

export function setActiveCampaign(
  address: string,
  certPem: string,
  token: string,
  campaignId: string
): Promise<ClientResult<{ campaign: CampaignJson }>> {
  return call(address, certPem, token, 'POST', '/active-campaign', { campaignId })
}

export function joinActiveCampaign(
  address: string,
  certPem: string,
  token: string
): Promise<ClientResult<{ campaign: CampaignJson }>> {
  return call(address, certPem, token, 'POST', '/active-campaign/join')
}

export function listNotes(
  address: string,
  certPem: string,
  token: string,
  campaignId: string
): Promise<ClientResult<{ notes: NoteJson[] }>> {
  return call(address, certPem, token, 'GET', `/campaigns/${campaignId}/notes`)
}

export function createNote(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared'; folderId?: string | null }
): Promise<ClientResult<{ note: NoteJson }>> {
  return call(address, certPem, token, 'POST', `/campaigns/${campaignId}/notes`, input)
}

export function updateNote(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  noteId: string,
  input: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' }
): Promise<ClientResult<{ note: NoteJson }>> {
  return call(address, certPem, token, 'PATCH', `/campaigns/${campaignId}/notes/${noteId}`, input)
}

export function deleteNote(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  noteId: string
): Promise<ClientResult<{ ok: true }>> {
  return call(address, certPem, token, 'DELETE', `/campaigns/${campaignId}/notes/${noteId}`)
}

export function listFolders(
  address: string,
  certPem: string,
  token: string,
  campaignId: string
): Promise<ClientResult<{ folders: FolderJson[] }>> {
  return call(address, certPem, token, 'GET', `/campaigns/${campaignId}/folders`)
}

export function createFolder(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  input: { name: string; visibility: 'dm' | 'shared'; parentFolderId?: string | null }
): Promise<ClientResult<{ folder: FolderJson }>> {
  return call(address, certPem, token, 'POST', `/campaigns/${campaignId}/folders`, input)
}

export function updateFolder(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  folderId: string,
  input: { name?: string; parentFolderId?: string | null; visibility?: 'dm' | 'shared' }
): Promise<ClientResult<{ folder: FolderJson }>> {
  return call(address, certPem, token, 'PATCH', `/campaigns/${campaignId}/folders/${folderId}`, input)
}

export function deleteFolder(
  address: string,
  certPem: string,
  token: string,
  campaignId: string,
  folderId: string
): Promise<ClientResult<{ ok: true }>> {
  return call(address, certPem, token, 'DELETE', `/campaigns/${campaignId}/folders/${folderId}`)
}
