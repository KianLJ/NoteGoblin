// Content-pack monsters (docs/homebrew-engine.md, phase 8): a monster entry
// is a statblock (the shape a ```statblock note block and the SRD bestiary
// use — name, size, type, ac, initiative, hp, speed, the six scores as
// text, cr, and traits / actions / bonus_actions / reactions /
// legendary_actions / lair_actions lists) plus an id.

import { xpForCr } from '../encounter'
import type { Registry } from './registry'
import type { ContentPack } from './schema'
import { SRD_PACK_ID } from './srd'
import { slugify, uniqueId } from './workshop'

export interface PackMonsterRecord {
  [key: string]: unknown
  name: string
  type: string
  /** The creature's index for encounters and lookups — a creature moved from this device keeps its old one. */
  index: string
  crNumeric: number
  xp: number
  traits: Array<{ name: string; desc: string }>
  actions: Array<{ name: string; desc: string }>
  bonus_actions: Array<{ name: string; desc: string }>
  reactions: Array<{ name: string; desc: string }>
  legendary_actions: Array<{ name: string; desc: string }>
  lair_actions: Array<{ name: string; desc: string }>
  packId: string
  packName: string
  fullId: string
}

export function crToNumeric(cr: string): number {
  const t = cr.trim()
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(Number)
    return d ? n / d : 0
  }
  return Number(t) || 0
}

const entries = (v: unknown): Array<{ name: string; desc: string }> =>
  Array.isArray(v) ? v.filter((e) => e && typeof e === 'object').map((e) => ({ name: String((e as { name?: unknown }).name ?? ''), desc: String((e as { desc?: unknown }).desc ?? '') })) : []

/** Every non-SRD monster in `registry` (overrides and hides applied), ready for the bestiary lists. */
export function packMonsterRecords(registry: Registry, packs: ContentPack[]): PackMonsterRecord[] {
  return registry
    .all('monsters')
    .filter((m) => m.packId !== SRD_PACK_ID)
    .map((m) => {
      const def = m.def as unknown as Record<string, unknown>
      const cr = def.cr === undefined || def.cr === null ? '0' : String(def.cr)
      return {
        ...def,
        name: String(def.name || 'Unnamed Creature'),
        type: String(def.type || 'unknown'),
        index: typeof def.index === 'string' && def.index ? def.index : `pack:${m.fullId}`,
        crNumeric: crToNumeric(cr),
        xp: xpForCr(cr),
        traits: entries(def.traits),
        actions: entries(def.actions),
        bonus_actions: entries(def.bonus_actions),
        reactions: entries(def.reactions),
        legendary_actions: entries(def.legendary_actions),
        lair_actions: entries(def.lair_actions),
        packId: m.packId,
        packName: packs.find((p) => p.id === m.packId)?.name ?? m.packId,
        fullId: m.fullId
      }
    })
}

/** A statblock as a pack monster entry, with an id not already in `taken` (bestiary-only fields dropped, the index kept). */
export function monsterEntry(data: Record<string, unknown>, taken: string[]): Record<string, unknown> {
  const { crNumeric: _cr, xp: _xp, packId: _p, packName: _pn, fullId: _f, ...statblock } = data
  void _cr
  void _xp
  void _p
  void _pn
  void _f
  const name = String(statblock.name ?? '').trim() || 'Unnamed Creature'
  return { ...statblock, id: uniqueId(slugify(name), taken), name, description: typeof statblock.description === 'string' ? statblock.description : '' }
}
