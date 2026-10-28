import type { CloudCharacter } from '@shared/cloudCharacter'

/** Same-origin — the viewer is served by the relay worker itself (see relay/wrangler.jsonc). */
const BASE = '/parties/directory/global-directory'
const TOKEN_KEY = 'ng-viewer-token'
const USERNAME_KEY = 'ng-viewer-username'

/** Thrown when the stored session is missing or rejected — the app drops back to the login screen. */
export class SignedOutError extends Error {}

export interface CampaignSummary {
  campaignId: string
  name: string
  updatedAt: string
}

export interface NoteRow {
  id: string
  title: string
  body_markdown: string
  folder_id: string | null
  pinned: 0 | 1
  visibility: string
  updated_at: string
}

export interface FolderRow {
  id: string
  name: string
  parent_folder_id: string | null
}

export interface CampaignSnapshot {
  name: string
  updatedAt: string
  notes: NoteRow[]
  folders: FolderRow[]
}

export interface CharacterSummary {
  id: string
  name: string
  subtitle: string
  updatedAt: string
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY)
}

export function isSignedIn(): boolean {
  return localStorage.getItem(TOKEN_KEY) !== null
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (init.auth !== false && !token) throw new SignedOutError('Log in to continue.')
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(init.auth !== false && token ? { authorization: `Bearer ${token}` } : {})
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    })
  } catch {
    throw new Error("Can't reach NoteGoblin right now — check your connection.")
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (res.status === 401 && init.auth !== false) {
    signOut()
    throw new SignedOutError('Your session expired — log in again.')
  }
  if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status}).`)
  return data as T
}

export async function logIn(username: string, password: string): Promise<void> {
  const result = await call<{ userId: string; username: string; token: string }>('/login', {
    method: 'POST',
    body: { username, password },
    auth: false
  })
  localStorage.setItem(TOKEN_KEY, result.token)
  localStorage.setItem(USERNAME_KEY, result.username)
}

export const listCampaigns = (): Promise<CampaignSummary[]> => call('/campaigns')
export const getCampaign = (id: string): Promise<CampaignSnapshot> => call(`/campaigns/${encodeURIComponent(id)}`)
export const listCharacters = (): Promise<CharacterSummary[]> => call('/characters')
export const getCharacter = (id: string): Promise<CloudCharacter> => call(`/characters/${encodeURIComponent(id)}`)
export const getPrefs = (): Promise<{ prefs: unknown }> => call('/prefs')
