// Validation problems in plain English for the Workshop — "classes[0].hitDie:
// Required" → "Class “Warden”: the hit die is missing" — with a one-click
// fix where there's an obvious one (an id made from the name, a duplicate
// id renamed).

import type { PackIssue } from './validate'
import { WORKSHOP_SECTIONS, entriesOf, slugify, uniqueId, type PackDraft } from './workshop'

export interface ExplainedIssue {
  severity: PackIssue['severity']
  /** Which entry and part ("Feat “Lucky” · effect 2"), or '' for the pack itself. */
  where: string
  message: string
  fix?: { label: string; apply: (draft: PackDraft) => PackDraft }
  /** The original path, for jumping to the entry. */
  path: string
}

type Token = string | number

function tokens(path: string): Token[] {
  const out: Token[] = []
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) out.push(m[2] !== undefined ? Number(m[2]) : m[1])
  return out
}

function getAt(root: unknown, path: Token[]): unknown {
  let v = root
  for (const t of path) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<string | number, unknown>)[t]
  }
  return v
}

function setAt<T>(root: T, path: Token[], value: unknown): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  const node = (Array.isArray(root) ? [...root] : { ...(root as object) }) as Record<string | number, unknown>
  node[head] = setAt(node[head], rest, value)
  return node as T
}

const FIELD_NAMES: Record<string, string> = {
  id: 'the id',
  name: 'the name',
  label: 'the label',
  hitDie: 'the hit die',
  classId: 'the class',
  category: 'the category',
  level: 'the level',
  max: 'the maximum',
  recharge: 'what it recharges on',
  value: 'the value',
  target: 'the number it changes',
  formula: 'the formula',
  damage: 'the damage',
  damageType: 'the damage type',
  resourceId: 'the resource',
  listId: 'the option list',
  actionType: 'what it takes (action, bonus…)',
  ability: 'the ability',
  ac: 'the Armor Class',
  hp: 'the hit points',
  text: 'the text',
  amount: 'the amount',
  options: 'the options',
  abilities: 'the abilities'
}

function fieldName(key: Token | undefined): string {
  if (typeof key !== 'string') return 'this'
  return FIELD_NAMES[key] ?? `“${key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}”`
}

/** "level 3 feature “Rage”, effect 2" — the parts of a path inside an entry, in words. */
function partsInWords(entry: unknown, rest: Token[]): string {
  const words: string[] = []
  let node = entry
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]
    const next = rest[i + 1]
    if (typeof t === 'string' && typeof next === 'number') {
      const list = (node as Record<string, unknown> | undefined)?.[t]
      const item = Array.isArray(list) ? list[next] : undefined
      const named = item && typeof item === 'object' ? ((item as { name?: unknown; label?: unknown }).name ?? (item as { label?: unknown }).label) : undefined
      if (t === 'levels') words.push(`level ${String((item as { level?: unknown } | undefined)?.level ?? next + 1)}`)
      else if (t === 'features' || t === 'traits') words.push(named ? `“${String(named)}”` : `feature ${next + 1}`)
      else if (t === 'effects' || t === 'onPick') words.push(`effect ${next + 1}`)
      else if (t === 'options') words.push(named ? `option “${String(named)}”` : `option ${next + 1}`)
      else if (t === 'columns') words.push(named ? `column “${String(named)}”` : `column ${next + 1}`)
      else words.push(`${t} ${next + 1}`)
      node = item
      i++
      continue
    }
    if (t === 'do' || t === 'action' || t === 'resource' || t === 'toggle' || t === 'choice' || t === 'attack' || t === 'companion' || t === 'config') {
      node = (node as Record<string, unknown> | undefined)?.[t]
      continue
    }
    break
  }
  return words.join(', ')
}

function messageFor(issue: PackIssue, key: Token | undefined, current: unknown): string {
  const m = issue.message
  if (m === 'Required') return `${capital(fieldName(key))} is missing.`
  if (/^String must contain at least 1 character/.test(m)) return `${capital(fieldName(key))} can't be empty.`
  if (/^Ids may only contain/.test(m)) return `${capital(fieldName(key))} can only use letters, numbers and - _ . : (no spaces).`
  if (/^Pack ids may only contain/.test(m)) return 'The pack id can only use letters, numbers and - _ . (no spaces).'
  const expected = m.match(/^Expected (\w+), received (\w+)/)
  if (expected) return `${capital(fieldName(key))} should be a ${expected[1] === 'array' ? 'list' : expected[1]}${typeof current === 'string' && current ? ` — “${current}” isn't one` : ''}.`
  const enumMatch = m.match(/^Invalid enum value\. Expected (.+), received '(.*)'/)
  if (enumMatch) return `${capital(fieldName(key))} can't be “${enumMatch[2]}” — it must be one of ${enumMatch[1].replace(/'/g, '').replace(/ \| /g, ', ')}.`
  if (/^Invalid discriminator value/.test(m)) return `${capital(fieldName(key))} is a kind this version doesn't know.`
  if (/^Number must be greater than or equal to/.test(m)) return `${capital(fieldName(key))} is too small (${m.replace(/^Number must be greater than or equal to /, 'at least ')}).`
  if (/^Number must be less than or equal to/.test(m)) return `${capital(fieldName(key))} is too big (${m.replace(/^Number must be less than or equal to /, 'at most ')}).`
  if (issue.path && key && /(formula|value|max|min|amount|damage|healing|count|budget|cost|bonus|ac|hp|tempHp|range|area|saveDc|attackBonus|prepared|known|cantrips|regain|shortRestRegain|hpFirstLevel|hpPerLevel|maxLevel)$/i.test(String(key)) && !/^No |^A transform/.test(m)) {
    return `This formula doesn't work yet: ${m}`
  }
  return m
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** One validation issue, explained (and, where obvious, fixable). `withinEntry` leaves out which entry it is when the reader is already looking at it. */
export function explainIssue(issue: PackIssue, draft: PackDraft, withinEntry = false): ExplainedIssue {
  const path = tokens(issue.path)
  const [kind, index, ...rest] = path
  const section = WORKSHOP_SECTIONS.find((s) => s.kind === kind)
  const entry = section && typeof index === 'number' ? entriesOf(draft, section.kind)[index] : undefined
  const key = path[path.length - 1]
  const parent = path.slice(0, -1)
  const current = getAt(draft, path)
  const entryName = entry ? String(entry.name ?? entry.id ?? '(unnamed)') : ''
  const where = [entry && !withinEntry ? `${capital(section!.singular)} “${entryName}”` : section ? '' : issue.path.startsWith('vocabulary') ? 'Vocabulary' : issue.path ? 'Pack details' : '', entry ? partsInWords(entry, rest) : '']
    .filter(Boolean)
    .join(' · ')
  const out: ExplainedIssue = { severity: issue.severity, where, message: messageFor(issue, key, current), path: issue.path }

  // Fixes: an id from its name; a bad id cleaned up.
  const siblingName = getAt(draft, [...parent, 'name']) ?? getAt(draft, [...parent, 'label'])
  if (key === 'id' && (issue.message === 'Required' || /at least 1 character/.test(issue.message)) && typeof siblingName === 'string' && siblingName.trim()) {
    const id = slugify(siblingName)
    out.fix = { label: `Use “${id}”`, apply: (d) => setAt(d, path, id) }
  } else if (key === 'id' && /may only contain/.test(issue.message) && typeof current === 'string') {
    const id = slugify(current)
    out.fix = { label: `Use “${id}”`, apply: (d) => setAt(d, path, id) }
  } else if (key === 'name' && issue.message === 'Required') {
    out.fix = { label: 'Call it “Unnamed”', apply: (d) => setAt(d, path, 'Unnamed') }
  }

  // Registry diagnostics name the problem in their message: a duplicate id gets renamed.
  const dup = issue.message.match(/^Duplicate (\w+) id "([^"]+)"/)
  if (dup) {
    const dupSection = WORKSHOP_SECTIONS.find((s) => s.kind === dup[1])
    if (dupSection) {
      const list = entriesOf(draft, dupSection.kind)
      const at = list.map((e, i) => (e.id === dup[2] ? i : -1)).filter((i) => i >= 0)
      const last = at[at.length - 1]
      out.where = `${capital(dupSection.singular)}s`
      out.message = `Two ${dupSection.label.toLowerCase()} share the id “${dup[2]}” — each needs its own.`
      if (at.length > 1) {
        const id = uniqueId(dup[2], list.map((e) => String(e.id ?? '')))
        out.fix = { label: `Rename the second to “${id}”`, apply: (d) => setAt(d, [dupSection.kind, last, 'id'], id) }
        out.path = `${dupSection.kind}[${last}].id`
      }
    }
  }
  return out
}
