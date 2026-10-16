import { describe, expect, it } from 'vitest'
import { choiceKeys } from '@shared/content/engine'
import { legacySheetToBuild } from '@shared/content/legacy'
import { CURRENT_SHEET_VERSION, acknowledgePackVersions, changedPacks, missingPacks, normalizeSheet } from '@shared/content/migrate'
import { deriveSheet } from '@shared/content/sheet'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { FEAT_CHOICE_IDS } from '@shared/content/srd/feats'
import { parsePack } from '@shared/content/validate'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'
import { regressionFixtures } from '../regression/fixtures'
import { engineDerive } from '../regression/project'

const srd = srdPack()
const id = (local: string): string => `${SRD_PACK_ID}:${local}`

const legacySheet = (): CharacterSheetData => ({
  ...emptyCharacterSheet(),
  race: 'Dwarf',
  background: 'Soldier',
  classes: [
    { className: 'Barbarian', level: 5, subclass: 'berserker' },
    { className: 'Fighter', level: 3, subclass: 'Champion' }
  ],
  abilityScores: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 10 }
})

/** A small homebrew pack built on the SRD, for the "enabled / not enabled" cases. */
const hexbound = parsePack(
  {
    formatVersion: 1,
    id: 'hexbound',
    name: 'Hexbound',
    version: '1.2.0',
    dependsOn: [SRD_PACK_ID],
    classes: [{ id: 'hexblade', name: 'Hexblade', hitDie: 10, saves: ['wis', 'cha'] }]
  },
  [srd]
)

describe('normalizeSheet', () => {
  it('adds pack ids, pack versions and the format version without touching legacy fields', () => {
    const before = legacySheet()
    const after = normalizeSheet(before)
    expect(after.sheetVersion).toBe(CURRENT_SHEET_VERSION)
    expect(after.classes).toEqual([
      { className: 'Barbarian', level: 5, subclass: 'berserker', classId: id('barbarian'), subclassId: id('berserker') },
      { className: 'Fighter', level: 3, subclass: 'Champion', classId: id('fighter'), subclassId: id('champion') }
    ])
    expect(after.speciesId).toBe(id('dwarf'))
    expect(after.backgroundId).toBe(id('soldier'))
    expect(after.packVersions).toEqual({ [SRD_PACK_ID]: srd.version })
    // Additive only: the input isn't mutated, and every legacy field survives as it was.
    expect(before.sheetVersion).toBeUndefined()
    expect({ ...after, sheetVersion: undefined, speciesId: undefined, backgroundId: undefined, packVersions: undefined, classes: before.classes }).toEqual({
      ...before,
      sheetVersion: undefined,
      speciesId: undefined,
      backgroundId: undefined,
      packVersions: undefined
    })
  })

  it('is idempotent and returns the same object when nothing changes', () => {
    const once = normalizeSheet(legacySheet())
    expect(normalizeSheet(once)).toBe(once)
  })

  it('re-resolves an id when its name changes (the UI still edits by name)', () => {
    const migrated = normalizeSheet(legacySheet())
    const renamed = normalizeSheet<CharacterSheetData>({ ...migrated, race: 'Elf', classes: [{ ...migrated.classes[0], className: 'Wizard', subclass: undefined }] })
    expect(renamed.speciesId).toBe(id('elf'))
    expect(renamed.classes[0].classId).toBe(id('wizard'))
    expect(renamed.classes[0].subclassId).toBeUndefined()
  })

  it('leaves custom names without an id', () => {
    const sheet = normalizeSheet<CharacterSheetData>({ ...legacySheet(), race: 'Kitsune', classes: [{ className: 'Sorcerer Hunter', level: 4 }] })
    expect(sheet.speciesId).toBeUndefined()
    expect(sheet.classes[0].classId).toBeUndefined()
  })

  it('keeps an id into a pack that is not enabled, so disabling a pack loses nothing', () => {
    const withPack = normalizeSheet<CharacterSheetData>({ ...legacySheet(), classes: [{ className: 'Hexblade', level: 4 }] }, [srd, hexbound])
    expect(withPack.classes[0].classId).toBe('hexbound:hexblade')
    expect(withPack.packVersions).toEqual({ hexbound: '1.2.0', [SRD_PACK_ID]: srd.version }) // the species and background are SRD
    const without = normalizeSheet(withPack, [srd])
    expect(without).toBe(withPack)
    expect(missingPacks(without, [srd])).toEqual([{ packId: 'hexbound', version: '1.2.0' }])
  })

  it('reports and acknowledges a pack that changed version since the sheet last saw it', () => {
    const sheet = normalizeSheet<CharacterSheetData>({ ...legacySheet(), classes: [{ className: 'Hexblade', level: 4 }] }, [srd, hexbound])
    const updated = { ...hexbound, version: '1.3.0' }
    expect(normalizeSheet(sheet, [srd, updated]).packVersions?.hexbound).toBe('1.2.0')
    expect(changedPacks(sheet, [srd, updated])).toEqual([{ packId: 'hexbound', from: '1.2.0', to: '1.3.0' }])
    const acknowledged = { ...sheet, ...acknowledgePackVersions(sheet, [srd, updated]) }
    expect(changedPacks(acknowledged, [srd, updated])).toEqual([])
  })
})

describe('adapter with format v2 sheets', () => {
  it('derives every regression fixture identically before and after migration', () => {
    for (const { name, sheet } of regressionFixtures()) {
      expect(engineDerive(normalizeSheet(sheet)).projected, name).toEqual(engineDerive(sheet).projected)
    }
  })

  it('resolves a homebrew class by id when its pack is enabled', () => {
    const sheet = normalizeSheet<CharacterSheetData>({ ...legacySheet(), classes: [{ className: 'Hexblade', level: 4 }] }, [srd, hexbound])
    const { build, warnings } = legacySheetToBuild(sheet, { packs: [hexbound] })
    expect(build.classes).toEqual([{ classId: 'hexbound:hexblade', level: 4 }])
    expect(warnings).toEqual([])
  })

  it('keeps the levels of a class whose pack is missing, with a warning', () => {
    const sheet = normalizeSheet<CharacterSheetData>({ ...legacySheet(), classes: [{ className: 'Hexblade', level: 4 }] }, [srd, hexbound])
    const { derived } = deriveSheet(sheet)
    expect(derived.level).toBe(4)
    expect(derived.diagnostics.map((d) => d.message)).toContain(
      'Hexblade comes from the "hexbound" content pack, which isn\'t enabled — only its levels count until it is.'
    )
  })

  it('lets a native pick override the legacy field for the same choice', () => {
    const base: CharacterSheetData = {
      ...emptyCharacterSheet(),
      classes: [{ className: 'Fighter', level: 4 }],
      abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
      asiSlotChoices: [{ id: 'a', className: 'Fighter', level: 4, kind: 'ability', abilityIncreases: { str: 2 } }]
    }
    expect(deriveSheet(base).derived.abilities.str.score).toBe(17)

    const asiKey = deriveSheet(base).derived.choices.find((c) => c.key.includes(':fighter:') && c.picks.includes(id('ability-score-improvement')))!.key
    const scoresKey = choiceKeys.choice(choiceKeys.pick(asiKey, id('ability-score-improvement')), FEAT_CHOICE_IDS.scores)
    const overridden = deriveSheet({ ...base, choices: { [scoresKey]: ['dex', 'dex'] } }).derived
    expect(overridden.abilities.str.score).toBe(15)
    expect(overridden.abilities.dex.score).toBe(16)
  })
})
