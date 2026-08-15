// Contract between the preload bridge and the renderer.
// Grows as features (campaigns, characters, etc.) land in later build steps.

export interface Identity {
  id: string
  displayName: string
}

export type LoginResult = { ok: true; identity: Identity } | { ok: false; error: string }

export interface HostAddressOption {
  address: string
  kind: 'tailscale' | 'lan' | 'other'
  inviteCode: string
}

export type HostingStatus =
  | { hosting: false }
  | { hosting: true; fingerprint: string; addresses: HostAddressOption[] }

export type HostingStartResult =
  | { ok: true; fingerprint: string; addresses: HostAddressOption[] }
  | { ok: false; error: string }

export type ProbeResult =
  | { ok: true; fingerprint: string; status: 'new' | 'match' | 'mismatch'; previousFingerprint?: string }
  | { ok: false; error: string }

export type JoinResult = { ok: true; address: string; fingerprint: string } | { ok: false; error: string }

/** Decoding a pasted invite code before connecting — lets the UI show what it found without committing to a probe/join yet. */
export type DecodeInviteResult =
  | { ok: true; address: string; fingerprint: string; label?: string }
  | { ok: false; error: string }

export interface KnownHostSummary {
  address: string
  label: string
  certFingerprint: string
  lastConnectedAt: string | null
}

export interface AppApi {
  getAppVersion: () => Promise<string>
  identity: {
    hasAny: () => Promise<boolean>
    create: (displayName: string, password: string) => Promise<LoginResult>
    login: (displayName: string, password: string) => Promise<LoginResult>
  }
  hosting: {
    start: () => Promise<HostingStartResult>
    stop: () => Promise<void>
    status: () => Promise<HostingStatus>
  }
  connections: {
    probe: (address: string) => Promise<ProbeResult>
    join: (address: string, label?: string) => Promise<JoinResult>
    list: () => Promise<KnownHostSummary[]>
    forget: (address: string) => Promise<void>
    decodeInvite: (code: string) => Promise<DecodeInviteResult>
  }
}
