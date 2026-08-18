import raw from './bestiary.json'
import type { StatblockData } from '../statblock'

/** One SRD 5.1 monster, shaped as a StatblockData (see statblock.ts) plus a couple of fields the browser needs for sorting/filtering that don't belong on a rendered card. Every entry in the bundled data always has a name/type, unlike a hand-typed note statblock — narrowed to required here. */
export interface BestiaryMonster extends StatblockData {
  name: string
  type: string
  index: string
  crNumeric: number
  xp: number
}

/** The full SRD monster roster — 334 entries, Open Gaming License content sourced from the 5e SRD (via the open 5e-bits/5e-database dataset). Bundled locally so the bestiary works fully offline, same as the rest of the app. */
export const BESTIARY: BestiaryMonster[] = raw as BestiaryMonster[]

export const BESTIARY_TYPES: string[] = [...new Set(BESTIARY.map((m) => m.type ?? 'unknown'))].sort()

/** Every distinct CR value present, ascending — used to build the CR filter's options instead of hand-listing them. */
export const BESTIARY_CRS: number[] = [...new Set(BESTIARY.map((m) => m.crNumeric))].sort((a, b) => a - b)

export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}
