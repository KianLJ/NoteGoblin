// The content-pack format — the single source of truth for what a "book" of
// homebrew (or the SRD itself) can express. Written as zod schemas so the
// exact same definitions both type the engine (via z.infer) and validate a
// pack imported from a file someone else made. See docs/homebrew-engine.md.
//
// Ids inside a pack are local ("mana"); the registry namespaces
// them as "<packId>:<localId>" so packs never collide. A reference to
// another entry may use either form — see registry.ts's resolve().

import { z } from 'zod'

/** A formula string — see formula.ts for the grammar. Validated for syntax separately (validatePack) so errors can point at the exact field. */
export const formulaSchema = z.string().min(1)
export type Formula = z.infer<typeof formulaSchema>

/** The 5e chassis's six abilities are fixed — packs can rename them (terminology) but not add or remove them. */
export const abilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
export type AbilityId = z.infer<typeof abilitySchema>

const idSchema = z.string().min(1).regex(/^[A-Za-z0-9_.:-]+$/, 'Ids may only contain letters, digits, _ . : and -')
const nameSchema = z.string().min(1)

// ---------------------------------------------------------------------------
// Filters

export const itemFilterSchema = z.object({
  /** Inside a choice's onPick, "$pick" stands for the picked item — "which sword is it?" → that sword's attacks. */
  itemIds: z.array(z.union([idSchema, z.literal('$pick')])).optional(),
  categories: z.array(z.string()).optional(),
  /** 'light' | 'medium' | 'heavy' | 'shield', or any pack-defined armour category. */
  armorCategories: z.array(z.string()).optional(),
  weaponCategories: z.array(z.string()).optional(),
  /** Matches if the item has any of these properties (case-insensitive). */
  properties: z.array(z.string()).optional()
})
export type ItemFilter = z.infer<typeof itemFilterSchema>

export const attackFilterSchema = z.object({
  range: z.enum(['melee', 'ranged']).optional(),
  abilities: z.array(abilitySchema).optional(),
  /** 'weapon' covers every equipped-weapon attack; 'unarmed' the unarmed strike; 'granted' attacks added by grantAttack; 'spell' spell attacks. */
  kinds: z.array(z.enum(['weapon', 'unarmed', 'granted', 'spell'])).optional(),
  item: itemFilterSchema.optional(),
  attackIds: z.array(idSchema).optional()
})
export type AttackFilter = z.infer<typeof attackFilterSchema>

// ---------------------------------------------------------------------------
// Conditions — when an effect applies

export type Condition =
  | { kind: 'level'; min?: number; max?: number }
  | { kind: 'classLevel'; classId: string; min: number }
  | { kind: 'subclass'; subclassId: string }
  | { kind: 'equipped'; filter: ItemFilter }
  | { kind: 'toggle'; toggleId: string }
  | { kind: 'condition'; conditionId: string; minLevel?: number }
  | { kind: 'hasEntry'; entryId: string }
  | { kind: 'formula'; formula: Formula }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }
  | { kind: 'not'; of: Condition }

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('level'), min: z.number().int().optional(), max: z.number().int().optional() }),
    z.object({ kind: z.literal('classLevel'), classId: idSchema, min: z.number().int() }),
    z.object({ kind: z.literal('subclass'), subclassId: idSchema }),
    z.object({ kind: z.literal('equipped'), filter: itemFilterSchema }),
    z.object({ kind: z.literal('toggle'), toggleId: idSchema }),
    z.object({ kind: z.literal('condition'), conditionId: idSchema, minLevel: z.number().int().optional() }),
    z.object({ kind: z.literal('hasEntry'), entryId: idSchema }),
    z.object({ kind: z.literal('formula'), formula: formulaSchema }),
    z.object({ kind: z.literal('all'), of: z.array(conditionSchema) }),
    z.object({ kind: z.literal('any'), of: z.array(conditionSchema) }),
    z.object({ kind: z.literal('not'), of: conditionSchema })
  ])
)

// ---------------------------------------------------------------------------
// Granted things: resources, actions, toggles, attacks, spellcasting, choices

export const rechargeKindSchema = z.enum(['short', 'long', 'dawn', 'turn', 'none'])
export type RechargeKind = z.infer<typeof rechargeKindSchema>

/** A built-in action economy ('action' | 'bonus' | 'reaction' | 'free') or a pack-defined one from vocabulary.actionTypes. */
const actionTypeSchema = z.string().min(1)

export const costSchema = z.object({ resourceId: idSchema, amount: formulaSchema.optional() })

export const resourceDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  max: formulaSchema,
  recharge: z.union([
    rechargeKindSchema,
    z.object({ when: conditionSchema, then: rechargeKindSchema, else: rechargeKindSchema })
  ]),
  /** How much comes back on recharge; omitted = all of it. */
  regain: formulaSchema.optional(),
  /** For a resource that recharges on a long rest (or dawn): how much a short rest gives back — e.g. "floor(@classLevel / 2)". Omitted = none. */
  shortRestRegain: formulaSchema.optional(),
  display: z.enum(['uses', 'pool']).optional(),
  actionType: actionTypeSchema.optional()
})
export type ResourceDef = z.infer<typeof resourceDefSchema>

export const attackDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  range: z.enum(['melee', 'ranged']),
  /** The best of these is used (finesse-style). */
  abilities: z.array(abilitySchema).min(1),
  /** Dice formula, e.g. "1d@table.martialArts" — the chosen ability's modifier is added on top unless addAbilityToDamage is false. */
  damage: formulaSchema,
  damageType: z.string(),
  addAbilityToDamage: z.boolean().optional(),
  proficient: z.boolean().optional(),
  /** Replaces another attack by id instead of adding a new one — e.g. Martial Arts replacing 'unarmed-strike'. */
  replaces: idSchema.optional(),
  actionType: actionTypeSchema.optional()
})
export type AttackDef = z.infer<typeof attackDefSchema>

/**
 * A variable amount the player chooses to spend when using an action ("spend
 * Mana up to your modifier", "spend any number of ki points") —
 * every formula on the action can read the chosen amount as @spent, so
 * damage, range, area and DC can scale with it.
 */
export const spendDefSchema = z.object({
  resourceId: idSchema,
  /** Defaults to 1. */
  min: formulaSchema.optional(),
  max: formulaSchema
})

/** Puts points back into a resource (or adds temporary ones on top of its max) — a potion of mana, a charm that refills ki. */
export const restoreDefSchema = z.object({
  resourceId: idSchema,
  amount: formulaSchema,
  /** Adds temporary points above the maximum instead of refilling spent ones. */
  temporary: z.boolean().optional()
})

export const actionDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  actionType: actionTypeSchema,
  /** A fixed cost paid every use. */
  cost: costSchema.optional(),
  /** A variable amount chosen at use time, on top of any fixed cost; the action's formulas read it as @spent. */
  spend: spendDefSchema.optional(),
  /** Optional roll the action makes. */
  attackBonus: formulaSchema.optional(),
  saveDc: formulaSchema.optional(),
  saveAbility: abilitySchema.optional(),
  damage: formulaSchema.optional(),
  damageType: z.string().optional(),
  healing: formulaSchema.optional(),
  tempHp: formulaSchema.optional(),
  /** Range and area in feet (formulas, so they can scale with @spent). */
  range: formulaSchema.optional(),
  area: formulaSchema.optional(),
  duration: z.string().optional(),
  restores: z.array(restoreDefSchema).optional(),
  /** Turning this action on activates a toggle (e.g. "Enter Rage" → the rage toggle). */
  activatesToggle: idSchema.optional()
})
export type ActionDef = z.infer<typeof actionDefSchema>

export const slotProgressionSchema = z.object({
  /** 'standard' slots sum across classes; 'pact' slots are tracked as their own pool. Packs can name new pools (renamed via terminology). */
  pool: z.string().optional(),
  /** rows[classLevel - 1][spellLevel - 1] = number of slots. */
  rows: z.array(z.array(z.number().int().min(0))).max(30)
})

export const spellcastingDefSchema = z.object({
  ability: abilitySchema,
  /** Spell list key spells are tagged with (SpellDef.lists). Defaults to the class's own local id. */
  list: z.string().optional(),
  slots: slotProgressionSchema.optional(),
  /** Prepared-caster limit formula (e.g. "max(1, @wis.mod + @classLevel)"). */
  prepared: formulaSchema.optional(),
  /** Known-caster limit formula (often "@table.spellsKnown"). */
  known: formulaSchema.optional(),
  cantrips: formulaSchema.optional(),
  ritualCasting: z.boolean().optional(),
  spellbook: z.boolean().optional()
})
export type SpellcastingDef = z.infer<typeof spellcastingDefSchema>

/** Where a choice's options come from. */
export const optionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('optionList'), listId: idSchema }),
  z.object({
    kind: z.literal('feats'),
    categories: z.array(z.string()).optional(),
    featIds: z.array(idSchema).optional()
  }),
  z.object({
    kind: z.literal('spells'),
    lists: z.array(z.string()).optional(),
    minLevel: z.number().int().optional(),
    maxLevel: formulaSchema.optional(),
    spellIds: z.array(idSchema).optional()
  }),
  z.object({ kind: z.literal('abilities'), abilities: z.array(abilitySchema).optional() }),
  /** Skills, optionally only ones the character is already proficient in (for Expertise). */
  z.object({ kind: z.literal('skills'), skillIds: z.array(idSchema).optional(), proficientOnly: z.boolean().optional() }),
  /** Weapons (items with weapon stats) from the enabled packs, optionally only some categories ("simple", "martial") — e.g. "proficiency with a weapon of your choice". */
  z.object({
    kind: z.literal('weapons'),
    categories: z.array(z.string()).optional(),
    itemIds: z.array(idSchema).optional(),
    /** Only melee or only ranged weapons. */
    range: z.enum(['melee', 'ranged']).optional(),
    /** Only weapons the character is proficient with (Weapon Mastery). */
    proficientOnly: z.boolean().optional()
  }),
  /** Archetypes (leveled feature sets — a bloodline, a patron, a tradition any class can take), filtered by tag or id. */
  z.object({ kind: z.literal('archetypes'), tags: z.array(z.string()).optional(), archetypeIds: z.array(idSchema).optional() }),
  /** Free text the player types (e.g. a language or a favoured enemy). */
  z.object({ kind: z.literal('freeform') })
])
export type OptionSource = z.infer<typeof optionSourceSchema>

// ---------------------------------------------------------------------------
// Effects

/**
 * Stat paths are dotted strings — see engine.ts's CORE_STATS for the full
 * built-in list (ability.str.score, save.dex, skill.stealth, ac, speed.walk,
 * hp.max, prof, spell.dc, slots.standard.3, resource.<id>.max, stat.<id>…).
 * Inside a choice's onPick effects, "$pick" is replaced by the picked id.
 */
const statPathSchema = z.string().min(1)

export interface Effect {
  when?: Condition
  do: EffectActionShape
}
export type EffectAction = EffectActionShape

export interface ChoiceDef {
  id: string
  label: string
  /** Defaults to 1. */
  count?: Formula
  from: OptionSource
  /** Allow picking the same option more than once (e.g. +1/+1 to the same ability = +2). */
  allowRepeats?: boolean
  maxRepeats?: number
  /** Applied once per pick, with "$pick" substituted. Options that carry their own effects (feats, option-list entries) apply those too. */
  onPick?: Effect[]
  /**
   * Point-buy: instead of a fixed number of picks, picks are paid for out of
   * this budget (option costs come from OptionDef.cost; anything else costs
   * 1). `count`, if also set, still caps the number of picks.
   */
  budget?: Formula
  /** Caps on how many picks can come from each OptionDef.group ("as many Strength improvements as your Strength modifier"). */
  groups?: { id: string; label: string; max: Formula }[]
}

const effectActionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('modify'),
      target: statPathSchema,
      /**
       * Applied in this order: set (highest wins, replaces the base) → add → multiply → cap (ability scores) →
       * uncapped add → atLeast / atMost → transform (in declaration order; its formula reads the running value as @value,
       * e.g. exhaustion's "floor(@value / 2 / 5) * 5").
       */
      op: z.enum(['add', 'set', 'multiply', 'atLeast', 'atMost', 'transform']),
      value: formulaSchema,
      /** For capped stats (ability scores): apply after the cap instead of under it — Epic Boons, Primal Champion. */
      uncapped: z.boolean().optional(),
      /** Only for attack.bonus / attack.damage targets. */
      appliesTo: attackFilterSchema.optional()
    }),
    z.object({ kind: z.literal('acFormula'), label: z.string(), formula: formulaSchema }),
    z.object({
      kind: z.literal('proficiency'),
      category: z.enum(['skill', 'save', 'weapon', 'armor', 'tool', 'language']),
      value: z.string().min(1),
      level: z.enum(['half', 'proficient', 'expertise']).optional()
    }),
    z.object({
      kind: z.literal('rollMode'),
      /** 'attack' | 'initiative' | 'check:<ability>' | 'save:<ability>' | 'skill:<skillId>' | 'deathSave', optionally narrowed by appliesTo for attacks. */
      target: z.string().min(1),
      mode: z.enum(['advantage', 'disadvantage']),
      appliesTo: attackFilterSchema.optional()
    }),
    z.object({
      kind: z.literal('damageRelation'),
      damageType: z.string().min(1),
      relation: z.enum(['resistance', 'immunity', 'vulnerability'])
    }),
    z.object({ kind: z.literal('conditionImmunity'), conditionId: z.string().min(1) }),
    z.object({ kind: z.literal('grantResource'), resource: resourceDefSchema }),
    z.object({ kind: z.literal('grantAction'), action: actionDefSchema }),
    z.object({ kind: z.literal('grantToggle'), toggle: toggleDefSchema }),
    z.object({ kind: z.literal('grantAttack'), attack: attackDefSchema }),
    z.object({
      kind: z.literal('grantSpells'),
      spellIds: z.array(idSchema),
      alwaysPrepared: z.boolean().optional(),
      free: z.boolean().optional(),
      ability: abilitySchema.optional()
    }),
    z.object({ kind: z.literal('grantChoice'), choice: choiceDefSchema }),
    z.object({ kind: z.literal('spellcasting'), config: spellcastingDefSchema }),
    z.object({
      kind: z.literal('extraDamage'),
      damage: formulaSchema,
      damageType: z.string().optional(),
      appliesTo: attackFilterSchema.optional()
    }),
    z.object({
      kind: z.literal('attackAbility'),
      ability: abilitySchema,
      appliesTo: attackFilterSchema.optional()
    }),
    z.object({
      kind: z.literal('damageReduction'),
      /** Flat amount taken off each instance of damage. */
      amount: formulaSchema,
      /** Omitted = all damage. */
      damageTypes: z.array(z.string()).optional(),
      label: z.string().optional()
    }),
    z.object({ kind: z.literal('grantCompanion'), companion: companionDefSchema }),
    z.object({ kind: z.literal('note'), text: z.string().min(1) }),
    /** Weapon Mastery: the character can use this kind of weapon's mastery property (an item id, or "$pick" in a weapons choice's onPick). */
    z.object({ kind: z.literal('weaponMastery'), itemId: z.union([idSchema, z.literal('$pick')]) })
  ])
)

export const effectSchema = z.object({
  when: conditionSchema.optional(),
  do: effectActionSchema
}) as z.ZodType<Effect>

export const choiceDefSchema: z.ZodType<ChoiceDef> = z.lazy(() =>
  z.object({
    id: idSchema,
    label: nameSchema,
    count: formulaSchema.optional(),
    from: optionSourceSchema,
    allowRepeats: z.boolean().optional(),
    maxRepeats: z.number().int().min(1).optional(),
    onPick: z.array(effectSchema).optional(),
    budget: formulaSchema.optional(),
    groups: z.array(z.object({ id: idSchema, label: nameSchema, max: formulaSchema })).optional()
  })
) as z.ZodType<ChoiceDef>

export interface ToggleDef {
  id: string
  name: string
  description?: string
  actionType?: string
  cost?: { resourceId: string; amount?: Formula }
  effects?: Effect[]
}

export const toggleDefSchema: z.ZodType<ToggleDef> = z.lazy(() =>
  z.object({
    id: idSchema,
    name: nameSchema,
    description: z.string().optional(),
    actionType: actionTypeSchema.optional(),
    cost: costSchema.optional(),
    effects: z.array(effectSchema).optional()
  })
) as z.ZodType<ToggleDef>

/** The shape of an effect's `do` — written out by hand because zod can't infer through the recursive z.lazy above. Must stay in sync with effectActionSchema. Nothing reachable from an effect has a zod default (defaults would make the authored and parsed shapes differ, which z.lazy can't type), so the engine applies them instead. */
export type EffectActionShape =
  | { kind: 'modify'; target: string; op: 'add' | 'set' | 'multiply' | 'atLeast' | 'atMost' | 'transform'; value: Formula; uncapped?: boolean; appliesTo?: AttackFilter }
  | { kind: 'acFormula'; label: string; formula: Formula }
  | { kind: 'proficiency'; category: 'skill' | 'save' | 'weapon' | 'armor' | 'tool' | 'language'; value: string; level?: 'half' | 'proficient' | 'expertise' }
  | { kind: 'rollMode'; target: string; mode: 'advantage' | 'disadvantage'; appliesTo?: AttackFilter }
  | { kind: 'damageRelation'; damageType: string; relation: 'resistance' | 'immunity' | 'vulnerability' }
  | { kind: 'conditionImmunity'; conditionId: string }
  | { kind: 'grantResource'; resource: ResourceDef }
  | { kind: 'grantAction'; action: ActionDef }
  | { kind: 'grantToggle'; toggle: ToggleDef }
  | { kind: 'grantAttack'; attack: AttackDef }
  | { kind: 'grantSpells'; spellIds: string[]; alwaysPrepared?: boolean; free?: boolean; ability?: AbilityId }
  | { kind: 'grantChoice'; choice: ChoiceDef }
  | { kind: 'spellcasting'; config: SpellcastingDef }
  | { kind: 'extraDamage'; damage: Formula; damageType?: string; appliesTo?: AttackFilter }
  | { kind: 'attackAbility'; ability: AbilityId; appliesTo?: AttackFilter }
  | { kind: 'damageReduction'; amount: Formula; damageTypes?: string[]; label?: string }
  | { kind: 'grantCompanion'; companion: CompanionDef }
  | { kind: 'note'; text: string }
  | { kind: 'weaponMastery'; itemId: string }

// ---------------------------------------------------------------------------
// Companions

/**
 * A creature that comes with a feature — a beast companion, a familiar, a
 * summoned spirit-beasts. Its numbers are formulas over its owner (@level,
 * @prof, @classLevel, the owner's modifiers…) plus its own ability scores
 * as @self.<ability>.score / @self.<ability>.mod, so it scales as the
 * owner levels. The sheet tracks each one's state and current HP.
 */
export const companionDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  size: z.string().optional(),
  creatureType: z.string().optional(),
  ac: formulaSchema,
  hp: formulaSchema,
  speed: z.string().optional(),
  abilities: z.record(abilitySchema, formulaSchema).optional(),
  attacks: z
    .array(
      z.object({
        name: nameSchema,
        bonus: formulaSchema,
        damage: formulaSchema,
        damageType: z.string().optional(),
        reach: z.string().optional()
      })
    )
    .optional(),
  traits: z.array(z.object({ name: nameSchema, description: z.string() })).optional(),
  /** What summoning it costs, if anything. */
  summonCost: costSchema.optional(),
  /** States the sheet offers besides the built-in summoned / dismissed / defeated (e.g. "Enraged", "Untamed"). */
  states: z.array(z.string()).optional()
})
export type CompanionDef = z.infer<typeof companionDefSchema>

// ---------------------------------------------------------------------------
// Content entries

export const featureDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().default(''),
  effects: z.array(effectSchema).default([])
})
export type FeatureDef = z.infer<typeof featureDefSchema>

/** One class-table column (Rages, Martial Arts die, Mana…) — values[classLevel - 1]. Readable in formulas as @table.<id> (owning class) or @class.<classId>.table.<id>. */
export const tableColumnSchema = z.object({
  id: idSchema,
  label: nameSchema,
  values: z.array(z.union([z.number(), z.string()])).max(30)
})

const levelEntrySchema = z.object({ level: z.number().int().min(1).max(30), features: z.array(featureDefSchema) })

/** Fields every entry kind shares: override/hide bookkeeping and a source citation. */
const entryBase = {
  id: idSchema,
  name: nameSchema,
  description: z.string().default(''),
  /** Replace this entry from a dependency pack (full or local id) — the override keeps the original's id. */
  overrides: idSchema.optional(),
  source: z.string().optional()
}

export const classDefSchema = z.object({
  ...entryBase,
  hitDie: z.number().int().min(1),
  /** Defaults: full hit die at character level 1, the die's average (rounded up) after. */
  hpFirstLevel: formulaSchema.optional(),
  hpPerLevel: formulaSchema.optional(),
  primaryAbilities: z.array(abilitySchema).default([]),
  saves: z.array(abilitySchema).default([]),
  skillChoice: z.object({ count: z.number().int().min(0), from: z.array(idSchema) }).optional(),
  armorProficiencies: z.array(z.string()).default([]),
  weaponProficiencies: z.array(z.string()).default([]),
  toolProficiencies: z.array(z.string()).default([]),
  /** Extra proficiencies granted when this class is taken as a multiclass (not the first class). */
  multiclassProficiencies: z.array(z.string()).optional(),
  multiclassPrerequisite: conditionSchema.optional(),
  /** 'never': a character with this class can't take levels in any other (and vice versa). */
  multiclass: z.enum(['allowed', 'never']).default('allowed'),
  subclassLevel: z.number().int().min(1).default(3),
  /** Shown in place of "Subclass" for this class — e.g. "Order". */
  subclassLabel: z.string().optional(),
  columns: z.array(tableColumnSchema).default([]),
  levels: z.array(levelEntrySchema).default([]),
  spellcasting: spellcastingDefSchema.optional(),
  startingEquipment: z.array(z.object({ itemId: idSchema, quantity: z.number().int().min(1).default(1) })).default([])
})
export type ClassDef = z.infer<typeof classDefSchema>

export const subclassDefSchema = z.object({
  ...entryBase,
  classId: idSchema,
  columns: z.array(tableColumnSchema).default([]),
  levels: z.array(levelEntrySchema).default([]),
  spellcasting: spellcastingDefSchema.optional()
})
export type SubclassDef = z.infer<typeof subclassDefSchema>

export const speciesDefSchema = z.object({
  ...entryBase,
  size: z.string().default('Medium'),
  speed: z.record(z.string(), formulaSchema).default({ walk: '30' }),
  traits: z.array(featureDefSchema).default([])
})
export type SpeciesDef = z.infer<typeof speciesDefSchema>

export const backgroundDefSchema = z.object({
  ...entryBase,
  features: z.array(featureDefSchema).default([])
})
export type BackgroundDef = z.infer<typeof backgroundDefSchema>

export const featDefSchema = z.object({
  ...entryBase,
  category: z.string().default('General'),
  prerequisite: conditionSchema.optional(),
  prerequisiteText: z.string().optional(),
  repeatable: z.boolean().default(false),
  effects: z.array(effectSchema).default([])
})
export type FeatDef = z.infer<typeof featDefSchema>

/**
 * A leveled feature set that isn't tied to one class — a bloodline,
 * a bloodline, a patron or pact several classes can take, a prestige path.
 * Granted by a choice (`from: { kind: 'archetypes' }`) on any class,
 * species, background or feat; its features unlock by `levelBasis`:
 * the level of the class whose feature granted it (default), the
 * character's highest class level, or total character level. Inside its
 * features, @archetypeLevel is that level and @table.<column> reads its
 * own columns.
 */
export const archetypeDefSchema = z.object({
  ...entryBase,
  tags: z.array(z.string()).default([]),
  prerequisite: conditionSchema.optional(),
  levelBasis: z.enum(['grantingClass', 'highestClass', 'character']).default('grantingClass'),
  /** A character can only have it once, however many choices could grant it. */
  unique: z.boolean().default(true),
  columns: z.array(tableColumnSchema).default([]),
  levels: z.array(levelEntrySchema).default([])
})
export type ArchetypeDef = z.infer<typeof archetypeDefSchema>

export const optionDefSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().default(''),
  prerequisite: conditionSchema.optional(),
  /** Point-buy cost when the choice has a budget (default 1). */
  cost: formulaSchema.optional(),
  /** Point-buy group, capped by the choice's `groups`. */
  group: z.string().optional(),
  effects: z.array(effectSchema).default([])
})
export type OptionDef = z.infer<typeof optionDefSchema>

/** A named pool of pickable options (Metamagic, Eldritch Invocations, Spirit Bonds, Rune Marks…). */
export const optionListDefSchema = z.object({
  ...entryBase,
  options: z.array(optionDefSchema)
})
export type OptionListDef = z.infer<typeof optionListDefSchema>

export const spellDefSchema = z.object({
  ...entryBase,
  level: z.number().int().min(0).max(20),
  school: z.string().default(''),
  castingTime: z.string().default('1 action'),
  range: z.string().default(''),
  components: z.string().default(''),
  duration: z.string().default('Instantaneous'),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  /** Spell lists this spell belongs to — matched against SpellcastingDef.list (class local ids by default). */
  lists: z.array(z.string()).default([]),
  higherLevel: z.string().optional(),
  attackType: z.enum(['melee', 'ranged']).optional(),
  saveAbility: abilitySchema.optional(),
  /** Dice formula; may use @spell.level / @slotLevel for upcasting. */
  damage: formulaSchema.optional(),
  damageType: z.string().optional(),
  healing: formulaSchema.optional(),
  /** Applied to the caster while the spell is active (needs the matching toggle on) — e.g. Mage Armor's acFormula. */
  effects: z.array(effectSchema).default([])
})
export type SpellDef = z.infer<typeof spellDefSchema>

export const itemDefSchema = z.object({
  ...entryBase,
  category: z.string(),
  rarity: z.string().optional(),
  cost: z.string().optional(),
  weight: z.number().min(0).optional(),
  requiresAttunement: z.boolean().default(false),
  weapon: z
    .object({
      category: z.string(),
      range: z.enum(['melee', 'ranged']),
      damage: formulaSchema,
      damageType: z.string(),
      versatileDamage: formulaSchema.optional(),
      properties: z.array(z.string()).default([]),
      normalRange: z.number().optional(),
      longRange: z.number().optional(),
      mastery: z.string().optional()
    })
    .optional(),
  armor: z
    .object({
      /** 'light' | 'medium' | 'heavy' | 'shield' or pack-defined. */
      category: z.string(),
      strengthRequirement: z.number().int().optional(),
      stealthDisadvantage: z.boolean().default(false)
    })
    .optional(),
  charges: resourceDefSchema.optional(),
  /** When the item's effects apply. Armour AC is expressed as effects too (acFormula / modify ac). */
  effectsWhen: z.enum(['equipped', 'attuned', 'carried']).default('equipped'),
  effects: z.array(effectSchema).default([])
})
export type ItemDef = z.infer<typeof itemDefSchema>

/** Monsters keep the existing statblock shape for now (phase 8 gives them effects). */
export const monsterDefSchema = z.object({ ...entryBase }).passthrough()
export type MonsterDef = z.infer<typeof monsterDefSchema>

// ---------------------------------------------------------------------------
// Vocabulary and terminology

export const vocabularySchema = z.object({
  skills: z.array(z.object({ id: idSchema, name: nameSchema, ability: abilitySchema })).default([]),
  damageTypes: z.array(z.object({ id: idSchema, name: nameSchema })).default([]),
  conditions: z
    .array(
      z.object({
        id: idSchema,
        name: nameSchema,
        description: z.string().default(''),
        /** Graded conditions like exhaustion; effects read @condition.<id>.level. */
        maxLevel: z.number().int().min(1).optional(),
        effects: z.array(effectSchema).default([])
      })
    )
    .default([]),
  currencies: z.array(z.object({ id: idSchema, name: nameSchema, valueInBase: z.number().positive() })).default([]),
  /** Custom numeric stats ("Channel Power", "Sanity") — read as @stat.<id>, targetable as stat.<id>. */
  stats: z.array(z.object({ id: idSchema, name: nameSchema, base: formulaSchema.default('0'), display: z.boolean().default(true) })).default([]),
  actionTypes: z.array(z.object({ id: idSchema, name: nameSchema })).default([]),
  weaponProperties: z.array(z.object({ id: idSchema, name: nameSchema, description: z.string().default('') })).default([]),
  spellSchools: z.array(z.object({ id: idSchema, name: nameSchema })).default([]),
  /** Numbers the player or DM keeps on the sheet (Renown, Corruption, Favour…) — read as @counter.<id>, usable in prerequisites. */
  counters: z
    .array(
      z.object({
        id: idSchema,
        name: nameSchema,
        description: z.string().default(''),
        min: z.number().default(0),
        max: formulaSchema.optional(),
        default: z.number().default(0)
      })
    )
    .default([]),
  /**
   * A named ability the player points at one of the six ("your channelling
   * ability is Wisdom or Charisma"). Formulas read @alias.<id>.mod /
   * .score; effects can target alias.<id>.score (it raises the chosen
   * ability). Until picked, the first option (or `default`) is used.
   */
  abilityAliases: z
    .array(z.object({ id: idSchema, name: nameSchema, description: z.string().default(''), options: z.array(abilitySchema).min(1), default: abilitySchema.optional() }))
    .default([]),
  /** Senses beyond the built-in ones (darkvision, blindsight, tremorsense, truesight) — ranges are the stat sense.<id>. */
  senses: z.array(z.object({ id: idSchema, name: nameSchema })).default([])
})
export type Vocabulary = z.infer<typeof vocabularySchema>

/** Display-only relabelling of core concepts — keys are documented in docs/homebrew-engine.md §7 (spellSlots, spells, cantrips, ability.str, skill.<id>, …). Mechanics never change. */
export const terminologySchema = z.record(z.string(), z.string())
export type Terminology = z.infer<typeof terminologySchema>

// ---------------------------------------------------------------------------
// The pack

export const PACK_FORMAT_VERSION = 1

export const contentPackSchema = z.object({
  formatVersion: z.literal(PACK_FORMAT_VERSION),
  id: z.string().min(1).regex(/^[A-Za-z0-9_.-]+$/, 'Pack ids may only contain letters, digits, _ . and -'),
  name: nameSchema,
  version: z.string().default('1.0.0'),
  author: z.string().default(''),
  description: z.string().default(''),
  builtIn: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
  /** Full ids of entries from dependencies to hide (houserules). */
  hides: z.array(z.string()).default([]),
  terminology: terminologySchema.default({}),
  vocabulary: vocabularySchema.default({}),
  classes: z.array(classDefSchema).default([]),
  subclasses: z.array(subclassDefSchema).default([]),
  species: z.array(speciesDefSchema).default([]),
  backgrounds: z.array(backgroundDefSchema).default([]),
  feats: z.array(featDefSchema).default([]),
  spells: z.array(spellDefSchema).default([]),
  items: z.array(itemDefSchema).default([]),
  monsters: z.array(monsterDefSchema).default([]),
  optionLists: z.array(optionListDefSchema).default([]),
  archetypes: z.array(archetypeDefSchema).default([])
})
export type ContentPack = z.infer<typeof contentPackSchema>
/** What a pack author writes — every defaulted field optional. */
export type ContentPackInput = z.input<typeof contentPackSchema>
