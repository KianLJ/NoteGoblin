import { abilityModifier, formatModifier } from '@shared/dnd5e'
import { escapeHtml } from './markdown'

/**
 * Renders a ```statblock fenced code block (see markdown.ts's `code`
 * renderer override) as a formatted D&D stat block card — the same rough
 * shape as the Fantasy Statblocks Obsidian plugin's YAML, so an existing
 * statblock someone already has in that format mostly just works.
 *
 * `parseStatblock` is a hand-rolled reader for exactly this shape (flat
 * `key: value` scalars, plus a handful of known keys as `- name: ...` /
 * `  desc: ...` block sequences) — not a general YAML parser. Malformed or
 * unrecognized lines are just skipped rather than thrown on, since a
 * half-finished statblock a DM is still typing shouldn't blow up the whole
 * note's preview.
 */

export interface StatblockEntry {
  name: string
  desc: string
}

export interface StatblockData {
  name?: string
  size?: string
  type?: string
  alignment?: string
  ac?: string
  hp?: string
  speed?: string
  str?: string
  dex?: string
  con?: string
  int?: string
  wis?: string
  cha?: string
  saves?: string
  skills?: string
  senses?: string
  languages?: string
  cr?: string
  damage_resistances?: string
  damage_immunities?: string
  damage_vulnerabilities?: string
  condition_immunities?: string
  traits: StatblockEntry[]
  actions: StatblockEntry[]
  reactions: StatblockEntry[]
  legendary_actions: StatblockEntry[]
}

const LIST_KEYS = ['traits', 'actions', 'reactions', 'legendary_actions'] as const
type ListKey = (typeof LIST_KEYS)[number]

const SCALAR_KEYS = new Set([
  'name',
  'size',
  'type',
  'alignment',
  'ac',
  'hp',
  'speed',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
  'saves',
  'skills',
  'senses',
  'languages',
  'cr',
  'damage_resistances',
  'damage_immunities',
  'damage_vulnerabilities',
  'condition_immunities'
])

function isListKey(key: string): key is ListKey {
  return (LIST_KEYS as readonly string[]).includes(key)
}

export function parseStatblock(text: string): StatblockData {
  const data: StatblockData = { traits: [], actions: [], reactions: [], legendary_actions: [] }
  let currentListKey: ListKey | null = null
  let currentItem: { name: string; desc: string } | null = null

  function flushItem(): void {
    if (currentListKey && currentItem && currentItem.name) {
      data[currentListKey].push({ name: currentItem.name, desc: currentItem.desc })
    }
    currentItem = null
  }

  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    const topMatch = !raw.startsWith(' ') ? /^(\w+):\s*(.*)$/.exec(raw) : null
    if (topMatch) {
      const key = topMatch[1].toLowerCase()
      const value = topMatch[2].trim()
      flushItem()
      if (isListKey(key)) {
        currentListKey = key
      } else {
        currentListKey = null
        if (SCALAR_KEYS.has(key) && value) (data as unknown as Record<string, string>)[key] = value
      }
      continue
    }
    if (!currentListKey) continue
    const itemStart = /^\s*-\s*name:\s*(.*)$/.exec(raw)
    if (itemStart) {
      flushItem()
      currentItem = { name: itemStart[1].trim(), desc: '' }
      continue
    }
    const descLine = /^\s*desc:\s*(.*)$/.exec(raw)
    if (descLine && currentItem) {
      currentItem.desc = descLine[1].trim()
      continue
    }
    // A wrapped continuation of the previous desc line.
    if (currentItem) currentItem.desc = `${currentItem.desc} ${raw.trim()}`.trim()
  }
  flushItem()
  return data
}

const ABILITY_LABELS: Array<['str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA']
]

function abilityCell(score: string | undefined): string {
  const n = score ? parseInt(score, 10) : NaN
  if (Number.isNaN(n)) return '<td>—</td>'
  return `<td>${n} (${formatModifier(abilityModifier(n))})</td>`
}

function metaLine(label: string, value: string | undefined): string {
  if (!value) return ''
  return `<div class="gb-statblock-line"><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</div>`
}

function entrySection(title: string, entries: StatblockEntry[]): string {
  if (entries.length === 0) return ''
  const rows = entries
    .map(
      (e) =>
        `<div class="gb-statblock-entry"><span class="gb-statblock-entry-name">${escapeHtml(e.name)}.</span> ${escapeHtml(e.desc)}</div>`
    )
    .join('')
  return `<h4 class="gb-statblock-section">${escapeHtml(title)}</h4>${rows}`
}

export function renderStatblockHtml(data: StatblockData): string {
  const subtitleParts = [data.size, data.type, data.alignment].filter(Boolean).join(', ')
  const abilityHeader = ABILITY_LABELS.map(([, label]) => `<th>${label}</th>`).join('')
  const abilityRow = ABILITY_LABELS.map(([key]) => abilityCell(data[key])).join('')

  return `
    <div class="gb-statblock">
      <div class="gb-statblock-name">${escapeHtml(data.name ?? 'Unnamed Creature')}</div>
      ${subtitleParts ? `<div class="gb-statblock-subtitle">${escapeHtml(subtitleParts)}</div>` : ''}
      <hr class="gb-statblock-rule" />
      ${metaLine('Armor Class', data.ac)}
      ${metaLine('Hit Points', data.hp)}
      ${metaLine('Speed', data.speed)}
      <hr class="gb-statblock-rule" />
      <table class="gb-statblock-abilities"><thead><tr>${abilityHeader}</tr></thead><tbody><tr>${abilityRow}</tr></tbody></table>
      <hr class="gb-statblock-rule" />
      ${metaLine('Saving Throws', data.saves)}
      ${metaLine('Skills', data.skills)}
      ${metaLine('Damage Vulnerabilities', data.damage_vulnerabilities)}
      ${metaLine('Damage Resistances', data.damage_resistances)}
      ${metaLine('Damage Immunities', data.damage_immunities)}
      ${metaLine('Condition Immunities', data.condition_immunities)}
      ${metaLine('Senses', data.senses)}
      ${metaLine('Languages', data.languages)}
      ${metaLine('Challenge', data.cr)}
      ${entrySection('Traits', data.traits)}
      ${entrySection('Actions', data.actions)}
      ${entrySection('Reactions', data.reactions)}
      ${entrySection('Legendary Actions', data.legendary_actions)}
    </div>
  `
}
