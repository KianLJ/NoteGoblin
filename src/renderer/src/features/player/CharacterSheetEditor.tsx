import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import { useAutosaveDraft } from './useAutosaveDraft'
import { LevelUpPopup } from './LevelUpPopup'
import { CombatTab } from './characterSheetTabs/CombatTab'
import { SpellsTab } from './characterSheetTabs/SpellsTab'
import { FeaturesTab } from './characterSheetTabs/FeaturesTab'
import { InventoryTab } from './characterSheetTabs/InventoryTab'
import { ClassTableTab } from './characterSheetTabs/ClassTableTab'
import { BackgroundTab } from './characterSheetTabs/BackgroundTab'
import { PackTraitsSection } from './characterSheetTabs/PackTraitsSection'
import { useSheetState } from './sheet/useSheetState'
import { AbilityTiles, DeathBanner, HitPointsCard, IdentityCard, ResourcesCard, SensesCard, SkillsCard, VitalsRow } from './sheet/SheetParts'
import './sheet/sheet.css'

interface CharacterSheetEditorProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData> & { name?: string }) => void
  /** DM viewing a connected player's synced character — tabs stay switchable, but every field/button underneath is inert (native `inert`, not just visually disabled, so nothing can be typed/dragged/clicked into it) and there's no name field, since this isn't your character to rename. Deletion lives in CharacterSwitcher now, not here — see its own doc comment for why. */
  readOnly?: boolean
  /** The joined/hosted session id — threaded down to every roll button so a check/save/skill/attack roll broadcasts to the table the same way the Dice Tray does. Omitted entirely for a readOnly mount (viewing someone else's sheet isn't your roll to make). */
  sessionId?: string | null
}

const TABS = ['Actions', 'Spells', 'Features', 'Inventory', 'Class', 'Story'] as const
type Tab = (typeof TABS)[number]

interface PendingLevelUp {
  className: string
  fromLevel: number
  toLevel: number
}

/**
 * The full character sheet — keyed by character.id from the parent, so
 * switching characters remounts this with fresh state.
 *
 * Three columns: a rail (who you are, hit points, vitals, resources,
 * conditions), the main column (ability tiles, then the tabs), and skills
 * with senses on the right. The always-visible parts share one draft
 * (useSheetState), so raising Constitution moves max HP straight away. All
 * tabs stay mounted (just hidden) rather than conditionally rendered, so a
 * debounced edit mid-flight in a tab you switch away from still fires
 * instead of being cancelled on unmount. The Class tab takes the skills
 * column's room, since a homebrew class table can be wide.
 *
 * Raising a class's level is enough on its own — the Features tab derives
 * everything (class features, subclass features, ASI/feat choices, racial
 * traits) live from class/level every render (see FeaturesTab.tsx), so a new
 * level's content just appears, and lowering it makes that content disappear
 * the same way. The level-up popup below is purely a convenience shortcut
 * for whatever the level you just crossed unlocked — closing it without
 * deciding anything loses nothing, since the same choice is still sitting
 * there, inline, in Features.
 */
export function CharacterSheetEditor({ character, onSave, readOnly, sessionId = null }: CharacterSheetEditorProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('Actions')
  const [nameDraft, setNameDraft] = useAutosaveDraft(character.name, (name) => onSave({ name }))
  const [pendingLevelUp, setPendingLevelUp] = useState<PendingLevelUp | null>(null)
  const s = useSheetState(character, onSave, {
    readOnly,
    sessionId,
    onLevelUp: (className, fromLevel, toLevel) => setPendingLevelUp({ className, fromLevel, toLevel })
  })
  const { derived } = s.derivedSheet
  const panel = (t: Tab): { display: string } => ({ display: tab === t ? 'block' : 'none' })

  return (
    <div className={`gs-root${readOnly ? ' gb-readonly-sheet' : ''}`}>
      {pendingLevelUp && !readOnly && (
        <LevelUpPopup
          character={character}
          className={pendingLevelUp.className}
          fromLevel={pendingLevelUp.fromLevel}
          toLevel={pendingLevelUp.toLevel}
          onSave={onSave}
          onClose={() => setPendingLevelUp(null)}
        />
      )}
      <div className={`gs${tab === 'Class' ? ' gs--wide' : ''}`}>
        <aside className="gs-rail">
          <IdentityCard s={s} name={readOnly ? character.name : nameDraft} onName={(name) => setNameDraft(() => name)} />
          <HitPointsCard s={s} />
          <VitalsRow s={s} />
          <ResourcesCard s={s} />
          <div className="gs-span">
            <PackTraitsSection character={character} derived={derived} onSave={onSave} readOnly={readOnly} />
          </div>
        </aside>

        <main className="gs-main">
          <DeathBanner s={s} name={character.name} />
          <AbilityTiles s={s} />
          <div className="gs-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`gs-tab${tab === t ? ' gs-tab--on' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="gs-panel">
            <div style={panel('Actions')}>
              <CombatTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} actionsOnly />
            </div>
            <div style={panel('Spells')}>
              <SpellsTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />
            </div>
            <div style={panel('Features')}>
              <FeaturesTab character={character} onSave={onSave} readOnly={readOnly} sessionId={sessionId} />
            </div>
            <div style={panel('Inventory')}>
              <InventoryTab character={character} onSave={onSave} readOnly={readOnly} />
            </div>
            <div style={panel('Class')}>
              <ClassTableTab character={character} onSave={onSave} readOnly={readOnly} />
            </div>
            <div style={panel('Story')}>
              <BackgroundTab character={character} onSave={onSave} readOnly={readOnly} />
            </div>
          </div>
        </main>

        <aside className="gs-side">
          <SkillsCard s={s} />
          <SensesCard s={s} />
        </aside>
      </div>
    </div>
  )
}
