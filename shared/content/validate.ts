// Validates a pack someone authored or imported: the zod shape first, then
// what zod can't see — formula syntax, and references between entries
// (a subclass's class, a choice's option list, a toggle's cost resource).
// Every issue carries a readable path ("classes[2].levels[0].features[1]
// .effects[0].do.value") so the Workshop can point at the exact field.

import { formulaSyntaxError } from './formula'
import { buildRegistry, type Registry } from './registry'
import { contentPackSchema, type ChoiceDef, type ContentPack, type Effect, type ResourceDef, type ToggleDef } from './schema'

export interface PackIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export type PackValidation = { ok: true; pack: ContentPack; issues: PackIssue[] } | { ok: false; issues: PackIssue[] }

function formatPath(path: Array<string | number>): string {
  return path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '')
}

/**
 * `others` are the packs this one may depend on (its dependencies must be
 * among them for cross-pack references to resolve).
 */
export function validatePack(input: unknown, others: ContentPack[] = []): PackValidation {
  const parsed = contentPackSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ severity: 'error', path: formatPath(i.path), message: i.message }))
    }
  }
  const pack = parsed.data
  const issues: PackIssue[] = []
  const registry = buildRegistry([...others.filter((o) => o.id !== pack.id), pack])
  for (const d of registry.diagnostics) {
    if (d.source === pack.id || d.source?.startsWith(`${pack.id}:`)) issues.push({ severity: d.severity, path: '', message: d.message })
  }
  new PackChecker(pack, registry, issues).check()
  return { ok: !issues.some((i) => i.severity === 'error'), pack, issues }
}

class PackChecker {
  private readonly resourceIds = new Set<string>()
  private readonly toggleIds = new Set<string>()

  constructor(
    private readonly pack: ContentPack,
    private readonly registry: Registry,
    private readonly issues: PackIssue[]
  ) {}

  private error(path: string, message: string): void {
    this.issues.push({ severity: 'error', path, message })
  }
  private warning(path: string, message: string): void {
    this.issues.push({ severity: 'warning', path, message })
  }

  private formula(path: string, value: string | undefined): void {
    if (value === undefined) return
    const err = formulaSyntaxError(value)
    if (err) this.error(path, err)
  }

  check(): void {
    const { pack } = this
    // Collect ids first so forward references (a cost naming a resource defined later) resolve.
    this.walkAllEffects((effect) => {
      if (effect.do.kind === 'grantResource') this.resourceIds.add(effect.do.resource.id)
      if (effect.do.kind === 'grantToggle') this.toggleIds.add(effect.do.toggle.id)
    })
    for (const item of pack.items) if (item.charges) this.resourceIds.add(item.charges.id)

    pack.vocabulary.stats.forEach((s, i) => this.formula(`vocabulary.stats[${i}].base`, s.base))
    ;(pack.vocabulary.counters ?? []).forEach((c, i) => this.formula(`vocabulary.counters[${i}].max`, c.max))
    pack.vocabulary.conditions.forEach((c, i) => this.effects(`vocabulary.conditions[${i}].effects`, c.effects))

    pack.classes.forEach((c, i) => {
      const p = `classes[${i}]`
      this.formula(`${p}.hpFirstLevel`, c.hpFirstLevel)
      this.formula(`${p}.hpPerLevel`, c.hpPerLevel)
      this.levels(p, c.levels)
      if (c.spellcasting) this.spellcasting(`${p}.spellcasting`, c.spellcasting)
      this.columns(p, c.columns)
      for (const s of c.skillChoice?.from ?? []) this.skill(`${p}.skillChoice`, s)
    })
    pack.subclasses.forEach((s, i) => {
      const p = `subclasses[${i}]`
      if (!this.registry.get('classes', s.classId, pack.id)) this.error(`${p}.classId`, `No class "${s.classId}" in this pack or its dependencies.`)
      this.levels(p, s.levels)
      if (s.spellcasting) this.spellcasting(`${p}.spellcasting`, s.spellcasting)
      this.columns(p, s.columns)
    })
    pack.species.forEach((s, i) => {
      Object.entries(s.speed).forEach(([k, v]) => this.formula(`species[${i}].speed.${k}`, v))
      s.traits.forEach((t, j) => this.effects(`species[${i}].traits[${j}].effects`, t.effects))
    })
    pack.backgrounds.forEach((b, i) => b.features.forEach((f, j) => this.effects(`backgrounds[${i}].features[${j}].effects`, f.effects)))
    pack.feats.forEach((f, i) => this.effects(`feats[${i}].effects`, f.effects))
    pack.optionLists.forEach((l, i) =>
      l.options.forEach((o, j) => {
        this.formula(`optionLists[${i}].options[${j}].cost`, o.cost)
        this.effects(`optionLists[${i}].options[${j}].effects`, o.effects)
      })
    )
    ;(pack.archetypes ?? []).forEach((a, i) => {
      this.levels(`archetypes[${i}]`, a.levels)
      this.columns(`archetypes[${i}]`, a.columns)
    })
    pack.spells.forEach((s, i) => {
      this.formula(`spells[${i}].damage`, s.damage)
      this.formula(`spells[${i}].healing`, s.healing)
      this.effects(`spells[${i}].effects`, s.effects)
    })
    pack.items.forEach((item, i) => {
      const p = `items[${i}]`
      this.formula(`${p}.weapon.damage`, item.weapon?.damage)
      this.formula(`${p}.weapon.versatileDamage`, item.weapon?.versatileDamage)
      if (item.charges) this.resource(`${p}.charges`, item.charges)
      this.effects(`${p}.effects`, item.effects)
    })
  }

  private walkAllEffects(visit: (e: Effect) => void): void {
    const walk = (list: Effect[] | undefined): void => {
      for (const e of list ?? []) {
        visit(e)
        if (e.do.kind === 'grantChoice') walk(e.do.choice.onPick)
        if (e.do.kind === 'grantToggle') walk(e.do.toggle.effects)
      }
    }
    const { pack } = this
    pack.vocabulary.conditions.forEach((c) => walk(c.effects))
    for (const c of [...pack.classes, ...pack.subclasses]) for (const l of c.levels) for (const f of l.features) walk(f.effects)
    for (const s of pack.species) for (const t of s.traits) walk(t.effects)
    for (const b of pack.backgrounds) for (const f of b.features) walk(f.effects)
    for (const f of pack.feats) walk(f.effects)
    for (const l of pack.optionLists) for (const o of l.options) walk(o.effects)
    for (const a of pack.archetypes ?? []) for (const l of a.levels) for (const f of l.features) walk(f.effects)
    for (const s of pack.spells) walk(s.effects)
    for (const i of pack.items) walk(i.effects)
  }

  private levels(path: string, levels: ContentPack['classes'][number]['levels']): void {
    levels.forEach((l, i) => l.features.forEach((f, j) => this.effects(`${path}.levels[${i}].features[${j}].effects`, f.effects)))
  }

  private columns(path: string, columns: ContentPack['classes'][number]['columns']): void {
    const seen = new Set<string>()
    columns.forEach((c, i) => {
      if (seen.has(c.id)) this.error(`${path}.columns[${i}].id`, `Duplicate table column "${c.id}".`)
      seen.add(c.id)
    })
  }

  private spellcasting(path: string, config: NonNullable<ContentPack['classes'][number]['spellcasting']>): void {
    this.formula(`${path}.prepared`, config.prepared)
    this.formula(`${path}.known`, config.known)
    this.formula(`${path}.cantrips`, config.cantrips)
  }

  private skill(path: string, id: string): void {
    // "$pick" is filled in from a choice at derive time.
    if (id.includes('$pick')) return
    if (!this.registry.vocabulary.skills.some((s) => s.id === id)) this.warning(path, `Unknown skill "${id}" — define it in vocabulary.skills.`)
  }

  private resource(path: string, r: ResourceDef): void {
    this.formula(`${path}.max`, r.max)
    this.formula(`${path}.regain`, r.regain)
    this.formula(`${path}.shortRestRegain`, r.shortRestRegain)
  }

  private cost(path: string, cost: { resourceId: string; amount?: string } | undefined): void {
    if (!cost) return
    this.formula(`${path}.amount`, cost.amount)
    if (!this.resourceIds.has(cost.resourceId)) this.warning(`${path}.resourceId`, `No resource "${cost.resourceId}" is granted anywhere in this pack.`)
  }

  private toggle(path: string, t: ToggleDef): void {
    this.cost(`${path}.cost`, t.cost)
    this.effects(`${path}.effects`, t.effects)
  }

  private choice(path: string, c: ChoiceDef): void {
    this.formula(`${path}.count`, c.count)
    this.formula(`${path}.budget`, c.budget)
    c.groups?.forEach((g, i) => this.formula(`${path}.groups[${i}].max`, g.max))
    const from = c.from
    if (from.kind === 'archetypes') {
      for (const id of from.archetypeIds ?? []) if (!this.registry.get('archetypes', id, this.pack.id)) this.error(`${path}.from.archetypeIds`, `No archetype "${id}".`)
    }
    if (from.kind === 'optionList' && !this.registry.get('optionLists', from.listId, this.pack.id)) {
      this.error(`${path}.from.listId`, `No option list "${from.listId}" in this pack or its dependencies.`)
    }
    if (from.kind === 'spells') this.formula(`${path}.from.maxLevel`, from.maxLevel)
    if (from.kind === 'feats') {
      for (const id of from.featIds ?? []) if (!this.registry.get('feats', id, this.pack.id)) this.error(`${path}.from.featIds`, `No feat "${id}".`)
    }
    if (from.kind === 'skills') for (const id of from.skillIds ?? []) this.skill(`${path}.from.skillIds`, id)
    this.effects(`${path}.onPick`, c.onPick)
  }

  private effects(path: string, list: Effect[] | undefined): void {
    ;(list ?? []).forEach((effect, i) => {
      const p = `${path}[${i}]`
      if (effect.when) this.condition(`${p}.when`, effect.when)
      const d = effect.do
      const dp = `${p}.do`
      switch (d.kind) {
        case 'modify':
          this.formula(`${dp}.value`, d.value)
          if (d.op === 'transform' && !d.value.includes('@value')) this.warning(`${dp}.value`, 'A transform usually reads the current value as @value.')
          break
        case 'acFormula':
          this.formula(`${dp}.formula`, d.formula)
          break
        case 'proficiency':
          if (d.category === 'skill') this.skill(dp, d.value)
          break
        case 'grantResource':
          this.resource(`${dp}.resource`, d.resource)
          break
        case 'grantAction':
          this.cost(`${dp}.action.cost`, d.action.cost)
          this.formula(`${dp}.action.attackBonus`, d.action.attackBonus)
          this.formula(`${dp}.action.saveDc`, d.action.saveDc)
          this.formula(`${dp}.action.damage`, d.action.damage)
          this.formula(`${dp}.action.healing`, d.action.healing)
          this.formula(`${dp}.action.tempHp`, d.action.tempHp)
          this.formula(`${dp}.action.range`, d.action.range)
          this.formula(`${dp}.action.area`, d.action.area)
          if (d.action.spend) {
            this.formula(`${dp}.action.spend.min`, d.action.spend.min)
            this.formula(`${dp}.action.spend.max`, d.action.spend.max)
            if (!this.resourceIds.has(d.action.spend.resourceId)) this.warning(`${dp}.action.spend.resourceId`, `No resource "${d.action.spend.resourceId}" is granted anywhere in this pack.`)
          }
          d.action.restores?.forEach((r, j) => {
            this.formula(`${dp}.action.restores[${j}].amount`, r.amount)
            if (!this.resourceIds.has(r.resourceId)) this.warning(`${dp}.action.restores[${j}].resourceId`, `No resource "${r.resourceId}" is granted anywhere in this pack.`)
          })
          if (d.action.activatesToggle && !this.toggleIds.has(d.action.activatesToggle)) {
            this.warning(`${dp}.action.activatesToggle`, `No toggle "${d.action.activatesToggle}" is granted anywhere in this pack.`)
          }
          break
        case 'grantToggle':
          this.toggle(`${dp}.toggle`, d.toggle)
          break
        case 'grantAttack':
          this.formula(`${dp}.attack.damage`, d.attack.damage)
          break
        case 'grantSpells':
          for (const id of d.spellIds) if (!this.registry.get('spells', id, this.pack.id)) this.error(`${dp}.spellIds`, `No spell "${id}".`)
          break
        case 'grantChoice':
          this.choice(`${dp}.choice`, d.choice)
          break
        case 'spellcasting':
          this.spellcasting(`${dp}.config`, d.config)
          break
        case 'extraDamage':
          this.formula(`${dp}.damage`, d.damage)
          break
        case 'damageReduction':
          this.formula(`${dp}.amount`, d.amount)
          break
        case 'grantCompanion': {
          const c = d.companion
          const cp = `${dp}.companion`
          this.formula(`${cp}.ac`, c.ac)
          this.formula(`${cp}.hp`, c.hp)
          Object.entries(c.abilities ?? {}).forEach(([k, v]) => this.formula(`${cp}.abilities.${k}`, v))
          c.attacks?.forEach((a, j) => {
            this.formula(`${cp}.attacks[${j}].bonus`, a.bonus)
            this.formula(`${cp}.attacks[${j}].damage`, a.damage)
          })
          this.cost(`${cp}.summonCost`, c.summonCost)
          break
        }
      }
    })
  }

  private condition(path: string, c: NonNullable<Effect['when']>): void {
    switch (c.kind) {
      case 'formula':
        this.formula(`${path}.formula`, c.formula)
        break
      case 'classLevel':
        if (!this.registry.get('classes', c.classId, this.pack.id)) this.warning(`${path}.classId`, `No class "${c.classId}" in this pack or its dependencies.`)
        break
      case 'all':
      case 'any':
        c.of.forEach((x, i) => this.condition(`${path}.of[${i}]`, x))
        break
      case 'not':
        this.condition(`${path}.of`, c.of)
        break
    }
  }
}

/** Parses a pack whose content is already trusted (built-in packs, tests) — throws with every issue listed if it's invalid. */
export function parsePack(input: unknown, others: ContentPack[] = []): ContentPack {
  const result = validatePack(input, others)
  if (!result.ok) throw new Error(`Invalid content pack:\n${result.issues.map((i) => `  ${i.path || '(pack)'}: ${i.message}`).join('\n')}`)
  return result.pack
}
