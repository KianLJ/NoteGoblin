import { describe, expect, it } from 'vitest'
import { CLASSES } from '@shared/dnd5e'
import { classSheet, regressionFixtures } from './fixtures'
import { legacyDerive } from './legacyDerive'
import { engineDerive } from './project'

// Phase 2 parity: every baseline fixture run through the legacy adapter, the
// SRD pack and deriveCharacter, projected back to the legacy shape. The
// snapshot file started as a copy of baseline.test.ts.snap (same entries,
// renamed), so a green run means the engine matches today's sheet exactly.
// Intentional rules changes update it in their own commit — diff it against
// the baseline snapshot to see every deliberate difference.
describe('SRD pack parity', () => {
  for (const { name, sheet } of regressionFixtures()) {
    it(name, () => {
      expect(engineDerive(sheet).projected).toMatchSnapshot()
    })
  }
})

// A denser sweep against the live legacy calculations: every class at every
// level, with its kit and ASIs but no feats (feat automation is where the
// engine deliberately differs — see the snapshot above). Legacy-compatible
// adapter options throughout.
describe('SRD pack matches legacy at every class level', () => {
  for (const cls of CLASSES) {
    it(cls.id, () => {
      for (let level = 1; level <= 20; level++) {
        const base = classSheet(cls.id, level, level)
        const sheet = { ...base, asiSlotChoices: base.asiSlotChoices.filter((s) => s.kind === 'ability') }
        expect(engineDerive(sheet, { assumeWeaponProficiency: true }).projected, `${cls.id} ${level}`).toEqual(legacyDerive(sheet))
      }
    })
  }
})
