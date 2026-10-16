import { describe, expect, it } from 'vitest'
import { regressionFixtures } from './fixtures'
import { legacyDerive } from './legacyDerive'

// Locks in what the sheet shows today for every fixture. When phase 2 moves
// the SRD onto the content engine, the engine's output (projected to this
// same shape) has to match these snapshots. Any intentional rules change
// (e.g. automating a feat that's only a note today) must update the snapshot
// deliberately, in the same commit, with the reason in the message.
describe('legacy derived-stat baseline', () => {
  for (const { name, sheet } of regressionFixtures()) {
    it(name, () => {
      expect(legacyDerive(sheet)).toMatchSnapshot()
    })
  }
})
