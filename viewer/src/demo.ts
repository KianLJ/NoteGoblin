// Sample content for working on the viewer locally without an account:
// `npm run viewer:dev`, then open /viewer/?demo. Only loaded in development
// (see api.ts), so it never ships in the built viewer.
import type { CharacterSheet } from '@shared/ipc'
import { emptyCharacterSheet } from '@shared/dnd5e'
import { buildCloudCharacter, type CloudCharacter } from '@shared/cloudCharacter'
import { deriveSheet } from '@shared/content/sheet'
import { spellsForViewer } from '@renderer/features/player/useCharacterCloudSync'
import type { CampaignSnapshot, CampaignSummary, CharacterSummary } from './api'

const sheet: CharacterSheet = {
  ...emptyCharacterSheet(),
  id: 'elowen',
  name: 'Elowen Brightwood',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: new Date(Date.now() - 40 * 60000).toISOString(),
  race: 'Elf',
  raceLineageChoice: { raceId: 'elf', lineageName: 'High Elf', spellcastingAbility: 'wis' },
  background: 'Sage',
  alignment: 'Neutral Good',
  classes: [{ className: 'Ranger', level: 5, subclass: 'Hunter' }],
  experiencePoints: 6500,
  abilityScores: { str: 10, dex: 18, con: 14, int: 12, wis: 14, cha: 8 },
  skillProficiencies: { Stealth: 'proficient', Perception: 'proficient', Nature: 'proficient', Survival: 'expertise', Insight: 'proficient' },
  currentHp: 31,
  tempHp: 5,
  spellcastingAbility: 'wis',
  equipment: [
    { id: 'e1', name: 'Longbow', quantity: 1, weight: 2, notes: '', equipped: true, compendiumId: 'longbow' },
    { id: 'e2', name: 'Shortsword', quantity: 1, weight: 2, notes: '', equipped: true, compendiumId: 'shortsword' },
    { id: 'e3', name: 'Studded Leather', quantity: 1, weight: 13, notes: '', equipped: true, compendiumId: 'studded-leather' },
    { id: 'e4', name: 'Rations', quantity: 5, weight: 2, notes: '' }
  ],
  spells: [
    { id: 's1', name: 'Cure Wounds', level: 1, description: '', compendiumId: 'cure-wounds' },
    { id: 's2', name: 'Ensnaring Strike', level: 1, description: '', compendiumId: 'ensnaring-strike' },
    { id: 's3', name: 'Pass without Trace', level: 2, description: '', compendiumId: 'pass-without-trace' }
  ],
  currency: { cp: 7, sp: 30, ep: 0, gp: 12, pp: 0 },
  backstory: 'Raised among the archives of Silverymoon, Elowen left to map the old roads.'
}

function character(): CloudCharacter {
  const derived = deriveSheet(sheet)
  return buildCloudCharacter(sheet, derived.derived, spellsForViewer(derived, sheet))
}

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600000).toISOString()

const campaign: CampaignSnapshot = {
  name: 'The Sunken Crown',
  updatedAt: hoursAgo(2),
  folders: [
    { id: 'f-places', name: 'Places', parent_folder_id: null },
    { id: 'f-people', name: 'People', parent_folder_id: null },
    { id: 'f-taverns', name: 'Taverns', parent_folder_id: 'f-places' }
  ],
  notes: [
    {
      id: 'n-overview',
      title: 'Campaign overview',
      body_markdown:
        '# The Sunken Crown\n\nThe crown of the drowned king lies somewhere beneath [[Saltmarsh Harbour]]. Whoever wears it commands the tides.\n\n## Threads\n\n- Who hired the smugglers at the [[The Leaky Lantern|Leaky Lantern]]?\n- What does **Captain Vess** want with the lighthouse?\n- The tide charts are wrong. *Someone changed them.*\n\n> The sea gives back what it takes — eventually.\n\nRoll for the weather each morning: `dice: 1d20`.',
      folder_id: null,
      pinned: 1,
      visibility: 'public',
      updated_at: hoursAgo(2)
    },
    {
      id: 'n-harbour',
      title: 'Saltmarsh Harbour',
      body_markdown: 'A fishing town of crooked piers and stubborn people.\n\n| District | Known for |\n|---|---|\n| The Wharf | Smugglers, fish |\n| Hightown | The council |\n\nSee also [[Captain Vess]].',
      folder_id: 'f-places',
      pinned: 0,
      visibility: 'public',
      updated_at: hoursAgo(26)
    },
    {
      id: 'n-lantern',
      title: 'The Leaky Lantern',
      body_markdown: 'The roof leaks; the ale doesn’t. Run by **Marta Gull**, who hears everything.',
      folder_id: 'f-taverns',
      pinned: 0,
      visibility: 'public',
      updated_at: hoursAgo(50)
    },
    {
      id: 'n-vess',
      title: 'Captain Vess',
      body_markdown: 'Harbour master. Smiles too much. Owes the Kraken Society a great deal of money.',
      folder_id: 'f-people',
      pinned: 0,
      visibility: 'public',
      updated_at: hoursAgo(80)
    }
  ]
}

const wait = <T,>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 150))

export const demo = {
  listCampaigns: (): Promise<CampaignSummary[]> => wait([{ campaignId: 'sunken', name: campaign.name, updatedAt: campaign.updatedAt }]),
  getCampaign: (): Promise<CampaignSnapshot> => wait(campaign),
  listCharacters: (): Promise<CharacterSummary[]> => wait([{ id: sheet.id, name: sheet.name, subtitle: character().subtitle, updatedAt: sheet.updatedAt }]),
  getCharacter: (): Promise<CloudCharacter> => wait(character()),
  getPrefs: (): Promise<{ prefs: unknown }> => wait({ prefs: null })
}
