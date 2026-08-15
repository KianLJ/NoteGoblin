/**
 * An invite code bundles an address AND the host's certificate fingerprint
 * into one paste-able string, so a joining player never has to type an IP,
 * and never has to manually eyeball/compare a fingerprint — the code IS the
 * shared secret that makes trust-on-first-connect automatic instead of a
 * "does this hex string match?" chore. The address+fingerprint prompt still
 * exists as a fallback for anyone who'd rather enter things by hand.
 */

const PREFIX = 'goblin1:'

interface InvitePayload {
  a: string // address, host:port
  f: string // cert fingerprint
  l?: string // suggested label
}

export function encodeInviteCode(address: string, fingerprint: string, label?: string): string {
  const payload: InvitePayload = { a: address, f: fingerprint, l: label }
  return PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodeInviteCode(
  code: string
): { address: string; fingerprint: string; label?: string } | null {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  try {
    const payload = JSON.parse(
      Buffer.from(trimmed.slice(PREFIX.length), 'base64url').toString('utf-8')
    ) as InvitePayload
    if (typeof payload.a !== 'string' || typeof payload.f !== 'string') return null
    return { address: payload.a, fingerprint: payload.f, label: payload.l }
  } catch {
    return null
  }
}
