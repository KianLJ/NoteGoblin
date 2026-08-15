import { networkInterfaces } from 'os'

export type AddressKind = 'tailscale' | 'lan' | 'other'

export interface LocalAddress {
  ip: string
  kind: AddressKind
}

/** Tailscale hands out addresses in 100.64.0.0/10 (the shared carrier-grade NAT range it reuses for its own mesh). */
function isTailscaleIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

/** Docker's default bridge network — reachable only from inside that machine, never by a friend on another device. */
function isDockerDefaultBridgeIp(ip: string): boolean {
  return ip.startsWith('172.17.')
}

/** Interface names virtualization/container/VPN-helper software tends to use — none of these are something a player on another device could dial into. */
const VIRTUAL_INTERFACE_NAME_PATTERN =
  /vethernet|docker|wsl|virtualbox|vbox|vmware|hyper-v|loopback|npcap|bluetooth/i

/** Every non-internal IPv4 address this machine has that a player on another device could plausibly reach — so a DM can share whichever one fits (Tailscale preferred, LAN as a fallback). */
export function getLocalAddresses(): LocalAddress[] {
  const interfaces = networkInterfaces()
  const addresses: LocalAddress[] = []

  for (const [name, entries] of Object.entries(interfaces)) {
    if (VIRTUAL_INTERFACE_NAME_PATTERN.test(name)) continue
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4') continue
      if (isDockerDefaultBridgeIp(entry.address)) continue
      addresses.push({ ip: entry.address, kind: isTailscaleIp(entry.address) ? 'tailscale' : 'lan' })
    }
  }

  return addresses.sort((a, b) => (a.kind === 'tailscale' ? -1 : b.kind === 'tailscale' ? 1 : 0))
}
