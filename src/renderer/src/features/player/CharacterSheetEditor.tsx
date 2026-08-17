import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import { totalLevel } from '@shared/dnd5e'
import { useAutosaveDraft } from './useAutosaveDraft'
import { LevelUpPrompt } from './LevelUpPrompt'
import { OverviewTab } from './characterSheetTabs/OverviewTab'
import { InventoryTab } from './characterSheetTabs/InventoryTab'
import { ClassTableTab } from './characterSheetTabs/ClassTableTab'
import { ClassFeaturesTab } from './characterSheetTabs/ClassFeaturesTab'
import { BackgroundTab } from './characterSheetTabs/BackgroundTab'

interface CharacterSheetEditorProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData> & { name?: string }) => void
  onDelete: () => void
  /** DM viewing a connected player's synced character — tabs stay switchable, but every field/button underneath is inert (native `inert`, not just visually disabled, so nothing can be typed/dragged/clicked into it) and there's no name field or Delete button, since this isn't your character to rename or remove. */
  readOnly?: boolean
}

const TABS = ['Overview', 'Inventory', 'Class Table', 'Class Features', 'Background'] as const
type Tab = (typeof TABS)[number]

interface PendingLevelUp {
  className: string
  fromLevel: number
  toLevel: number
}

/** Full D&D 5e stat block — keyed by character.id from the parent, so switching characters remounts this with fresh state. All tabs stay mounted (just hidden) rather than conditionally rendered, so a debounced edit mid-flight in a tab you switch away from still fires instead of being cancelled on unmount. */
export function CharacterSheetEditor({ character, onSave, onDelete, readOnly }: CharacterSheetEditorProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('Overview')
  const [nameDraft, setNameDraft] = useAutosaveDraft(character.name, (name) => onSave({ name }))
  const [pendingLevelUp, setPendingLevelUp] = useState<PendingLevelUp | null>(null)

  const level = totalLevel(character.classes)
  const subtitle = [character.race, character.classes[0]?.className, character.classes.length ? `${level}` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {pendingLevelUp && !readOnly && (
        <LevelUpPrompt
          character={character}
          className={pendingLevelUp.className}
          fromLevel={pendingLevelUp.fromLevel}
          toLevel={pendingLevelUp.toLevel}
          onSave={onSave}
          onClose={() => setPendingLevelUp(null)}
        />
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-5) var(--space-5) 0'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {readOnly ? (
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-primary)'
              }}
            >
              {character.name}
            </div>
          ) : (
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(() => e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-primary)',
                width: '100%'
              }}
            />
          )}
          {subtitle && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              flexShrink: 0
            }}
          >
            Delete
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-5) 0',
          borderBottom: '1px solid var(--border-subtle)',
          marginTop: 'var(--space-3)'
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              padding: '0 0 var(--space-2)',
              cursor: 'pointer'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        className={readOnly ? 'gb-readonly-sheet' : undefined}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5)' }}
      >
        <div style={{ display: tab === 'Overview' ? 'block' : 'none' }}>
          <OverviewTab
            character={character}
            onSave={onSave}
            readOnly={readOnly}
            onLevelUp={(className, fromLevel, toLevel) => setPendingLevelUp({ className, fromLevel, toLevel })}
          />
        </div>
        <div style={{ display: tab === 'Inventory' ? 'block' : 'none' }}>
          <InventoryTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
        <div style={{ display: tab === 'Class Table' ? 'block' : 'none' }}>
          <ClassTableTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
        <div style={{ display: tab === 'Class Features' ? 'block' : 'none' }}>
          <ClassFeaturesTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
        <div style={{ display: tab === 'Background' ? 'block' : 'none' }}>
          <BackgroundTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
      </div>
    </div>
  )
}
