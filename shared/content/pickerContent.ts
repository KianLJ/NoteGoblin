import { BACKGROUNDS, CLASSES, RACES, type Ability, type Background, type Class, type Race, type SkillName } from '../dnd5e'
import type { BackgroundDef, ContentPack } from './schema'
import { subclassesForClass, type CompendiumSubclass } from '../compendium'
import { registryForPacks } from './migrate'
import { getActivePacks } from './sheet'
import { SRD_PACK_ID, srdPack } from './srd'

/**
 * What the class / species / background / subclass pickers offer: the SRD
 * entries exactly as before, then every entry the active content packs add
 * (see shared/content/sheet.ts's active packs), adapted to the same shapes
 * the pickers already use. A homebrew entry's own picks (a homebrew
 * background's ability increases, a homebrew class's choices) aren't asked
 * here — they show up on the Features tab as generic choice cards once the
 * character exists.
 */
export interface PickerContent {
  classes: Class[]
  races: Race[]
  backgrounds: Background[]
  /** Subclasses for a class, by its display name. */
  subclassesFor: (className: string) => CompendiumSubclass[]
  /** A background's origin feat as a pack names it (its name and description), for the creator's background cards; undefined for an SRD background (the creator has those) or one with no single feat. */
  originFeatFor: (backgroundId: string) => { name: string; description: string } | undefined
}

const lower = (s: string): string => s.trim().toLowerCase()

/** The picker lists for some packs (the active ones by default). React components use usePickerContent (renderer), which re-builds this when the packs change. */
export function buildPickerContent(packs: ContentPack[] = getActivePacks()): PickerContent {
  const registry = registryForPacks([srdPack(), ...packs])
  const fromPacks = <T extends { fullId: string }>(entries: T[]): T[] => entries.filter((e) => !e.fullId.startsWith(`${SRD_PACK_ID}:`))
  const skillName = (id: string): SkillName => (registry.vocabulary.skills.find((s) => s.id === id)?.name ?? id) as SkillName
  const notTaken = <T extends { name: string }>(base: T[], extra: T[]): T[] => [...base, ...extra.filter((e) => !base.some((b) => lower(b.name) === lower(e.name)))]

  const classes = notTaken(
    CLASSES,
    fromPacks(registry.all('classes')).map(({ fullId, def }) => ({
      id: fullId,
      name: def.name,
      hitDie: def.hitDie,
      primaryAbility: def.primaryAbilities,
      savingThrowProficiencies: def.saves,
      skillChoice: { choose: def.skillChoice?.count ?? 0, from: (def.skillChoice?.from ?? []).map(skillName) },
      spellcastingAbility: def.spellcasting?.ability ?? null,
      subclassLevel: def.subclassLevel
    }))
  )
  const races = notTaken(
    RACES,
    fromPacks(registry.all('species')).map(({ fullId, def }) => ({
      id: fullId,
      name: def.name,
      abilityBonuses: {},
      speed: Number(def.speed.walk) || 30,
      traits: def.traits.map((t) => t.name)
    }))
  )
  // A pack background's origin feat, skills and tool, read from its effects (the same ones the rules engine applies).
  const originFeats = new Map<string, { name: string; description: string }>()
  const backgrounds = notTaken(
    BACKGROUNDS,
    fromPacks(registry.all('backgrounds')).map(({ fullId, packId, def }) => {
      const granted = backgroundGrants(def)
      const feat = granted.featId ? registry.get('feats', granted.featId, packId) : undefined
      if (feat) originFeats.set(fullId, { name: feat.def.name, description: feat.def.description })
      return {
        id: fullId,
        name: def.name,
        abilityScores: backgroundAbilities(def),
        featId: feat?.fullId ?? granted.featId ?? '',
        skillProficiencies: granted.skills.map(skillName),
        toolProficiency: granted.tools.join(', ')
      }
    })
  )

  function subclassesFor(className: string): CompendiumSubclass[] {
    const srd = CLASSES.find((c) => lower(c.name) === lower(className))
    const cls = registry.all('classes').find((c) => lower(c.def.name) === lower(className))
    const extra = cls
      ? fromPacks(registry.all('subclasses'))
          .filter(({ def }) => def.classId === cls.def.id || def.classId === cls.fullId)
          .map(({ fullId, def }) => ({ id: fullId, name: def.name, classId: cls.def.id, flavor: def.description }))
      : []
    return notTaken(srd ? subclassesForClass(srd.id) : [], extra)
  }

  return { classes, races, backgrounds, subclassesFor, originFeatFor: (id) => originFeats.get(id) }
}

/** What a pack background grants outright: the one feat its feat choice offers (an origin feat), and its skill and tool proficiencies. */
function backgroundGrants(def: BackgroundDef): { featId?: string; skills: string[]; tools: string[] } {
  const out: { featId?: string; skills: string[]; tools: string[] } = { skills: [], tools: [] }
  for (const f of def.features) {
    for (const e of f.effects) {
      if (e.when) continue
      const action = e.do as { kind?: string; category?: string; value?: string; choice?: { from?: { kind?: string; featIds?: string[] } } }
      if (action.kind === 'grantChoice' && action.choice?.from?.kind === 'feats' && action.choice.from.featIds?.length === 1 && !out.featId) out.featId = action.choice.from.featIds[0]
      if (action.kind === 'proficiency' && action.category === 'skill' && action.value) out.skills.push(action.value)
      if (action.kind === 'proficiency' && action.category === 'tool' && action.value) out.tools.push(action.value)
    }
  }
  return out
}

/** The abilities a pack background's own ability-score choice offers (all six when it lists none), for the creator's background step; none if it has no such choice. */
function backgroundAbilities(def: BackgroundDef): Ability[] {
  for (const f of def.features) {
    for (const e of f.effects) {
      const action = e.do as { kind?: string; choice?: { from?: { kind?: string; abilities?: Ability[] } } }
      if (action.kind === 'grantChoice' && action.choice?.from?.kind === 'abilities') {
        const listed = action.choice.from.abilities ?? []
        return listed.length ? listed : ['str', 'dex', 'con', 'int', 'wis', 'cha']
      }
    }
  }
  return []
}
