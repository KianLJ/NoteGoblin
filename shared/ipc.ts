// Contract between the preload bridge and the renderer.
// Grows as features (host/join, campaigns, characters, etc.) land in later build steps.

export interface Identity {
  id: string
  displayName: string
}

export type LoginResult = { ok: true; identity: Identity } | { ok: false; error: string }

export interface AppApi {
  getAppVersion: () => Promise<string>
  identity: {
    hasAny: () => Promise<boolean>
    create: (displayName: string, password: string) => Promise<LoginResult>
    login: (displayName: string, password: string) => Promise<LoginResult>
  }
}
