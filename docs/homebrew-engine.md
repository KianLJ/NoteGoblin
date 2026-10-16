# Homebrew content engine — design

Goal: anyone can enter an entire third-party/homebrew book (e.g. a JJK-themed
5e supplement) — classes, subclasses, species, backgrounds, feats, spells,
items, monsters, class resources, toggles and new rules vocabulary — and have
it work on the character sheet exactly as well as SRD content does:
calculations, level-up, choices, actions, resources, the Codex, and sync.

## Decisions (agreed)

| Question | Decision |
| --- | --- |
| Engine | One content engine for everything. **The SRD is rebuilt as the first built-in pack**, so homebrew can do anything SRD can. |
| Inexpressible rules | Formulas + effects cover mechanics; anything beyond that becomes a highlighted manual note / toggle. **No user scripts.** |
| Ownership | Packs live in a user's library. Anyone can author or import one; **only the DM enables packs for a campaign**. |
| Rules chassis | 5e core (six abilities, proficiency, d20) stays, but packs can **add** skills, damage types, conditions, resources, currencies and custom stats, and can **rename** existing concepts (terminology layer). |

## Why a rewrite is needed

Today mechanics are code, not data:

- Class checks hard-coded in calculations (`className === 'monk'` in
  `computeArmorClassFromEquipment`, `classFeatureSpeedBonus`, barbarian
  capstone in `effectiveAbilityScores`).
- Class-specific UI branches (`isMetamagicClass`, `isWarlockClass`,
  `isWizardClass`, … in `FeaturesTab.tsx` and `LevelUpPopup.tsx`), and
  feature rows matched by exact name.
- `CLASS_RESOURCES.max` / `recharge` are TS functions — not serialisable.
- `FeatEffect` is the only data-driven effect system, and it's feat-only.
- Characters reference classes/species/backgrounds by display name.

Anything left hard-coded is a gap homebrew can't fill, so all of it moves
onto the engine.

## 1. Content packs

```ts
interface ContentPack {
  id: string                 // 'srd-5.2.1', or uuid for user packs
  name: string; version: string; author: string; description?: string
  builtIn?: boolean          // SRD — read-only, always available
  dependsOn?: string[]       // e.g. JJK pack extends srd-5.2.1
  terminology?: TerminologyOverrides
  vocabulary?: Vocabulary    // new skills, damage types, conditions, currencies, stats
  classes: ClassDef[]; subclasses: SubclassDef[]
  species: SpeciesDef[]; backgrounds: BackgroundDef[]
  feats: FeatDef[]; spells: SpellDef[]
  items: ItemDef[]           // mundane + magic + weapons + armor unified
  monsters: MonsterDef[]
  optionLists: OptionListDef[]  // Metamagic, Invocations, Fighting Styles, "Cursed Techniques"…
}
```

- Every entry id is namespaced `packId:entryId`, so packs never collide and
  a sheet reference always resolves to a specific pack.
- Packs can **override** an entry from a pack they depend on
  (`overrides: 'srd-5.2.1:wizard'`) and **hide** entries (houserules).
- Storage: user library in the local DB (`content_packs` table, JSON blob per
  pack). Campaign enablement in the host DB (`campaign_packs`: campaign id,
  pack id, version, pack JSON snapshot), so players receive exactly the
  version the DM enabled via the session protocol and the offline snapshot.
- Import/export as a `.ngpack.json` file; schema-validated on import with
  readable errors.

## 2. Effects

One effect model attached to any source: class level, subclass feature,
species trait, background, feat, item (while equipped/attuned), spell (while
active), option pick, toggle, condition.

```ts
interface Effect {
  id: string
  when?: Condition              // gating — see below
  do: EffectAction
}

type EffectAction =
  | { kind: 'modify'; target: StatPath; op: 'add' | 'set' | 'multiply' | 'atLeast' | 'atMost' | 'transform'; value: Formula; uncapped?: boolean; appliesTo?: AttackFilter }
  | { kind: 'acFormula'; formula: Formula; label: string }   // Unarmored Defense, Mage Armor, natural armor
  | { kind: 'proficiency'; category: 'skill' | 'save' | 'weapon' | 'armor' | 'tool' | 'language'; value: string; level?: 'proficient' | 'expertise' | 'half' }
  | { kind: 'rollMode'; target: RollTarget; mode: 'advantage' | 'disadvantage' }
  | { kind: 'damageRelation'; damageType: string; relation: 'resistance' | 'immunity' | 'vulnerability' }
  | { kind: 'conditionImmunity'; condition: string }
  | { kind: 'grantResource'; resource: ResourceDef }
  | { kind: 'grantAction'; action: ActionDef }
  | { kind: 'grantToggle'; toggle: ToggleDef }
  | { kind: 'grantSpells'; spells: string[]; alwaysPrepared?: boolean; free?: boolean; ability?: Ability }
  | { kind: 'grantChoice'; choice: ChoiceDef }               // pick N from a list → picks apply their own effects
  | { kind: 'spellcasting'; config: SpellcastingDef }
  | { kind: 'grantAttack'; attack: AttackDef }                // natural weapons, Martial Arts (can replace the unarmed strike)
  | { kind: 'attackAbility'; ability: Ability; appliesTo: AttackFilter }
  | { kind: 'extraDamage'; damage: Formula; damageType?: string; appliesTo: AttackFilter }
  | { kind: 'note'; text: string }                           // the manual escape hatch
```

`StatPath` covers every number on the sheet: abilities, saves, skills,
passive scores, AC, initiative, each speed type, max HP, HP per level, hit
die, proficiency bonus, attack/damage bonus by filter, spell DC/attack,
spell slots per level, prepared/known limits, carrying capacity, resource
maxima, and any pack-defined custom stat.

**Conditions** (`when`): class/total level ≥ N, subclass chosen, wearing
armour (by category), shield equipped, wielding a weapon matching a filter,
toggle/buff active, condition present, HP below a formula, and
`all`/`any`/`not` combinators.

**Evaluation**: a single pure function
`deriveCharacter(sheet, enabledPacks) → DerivedSheet`, run every render,
replacing the scattered `effective*`/`compute*` helpers. Stored sheet data
stays raw (picks, spent uses, equipment); everything else is derived, which
keeps today's "never bake bonuses into base scores" rule. Ordering: base
(highest `set` replaces it) → add → multiply → cap (ability scores, via
`ability.<a>.max`) → `uncapped` adds → atLeast/atMost → `transform`
(reads the running value as `@value`, e.g. exhaustion's
`floor(@value / 2 / 5) * 5`). Stats are computed lazily with memoisation,
so formulas can read other derived stats; cycles become a clear diagnostic.

## 3. Formula language

A small safe expression parser (no `eval`): numbers, `+ - * /`, parentheses,
`floor ceil round min max clamp`, comparison/ternary, and dice notation for
damage. References:

`@str.mod`, `@str.score`, `@prof`, `@level`, `@classLevel` (owning class),
`@class.<id>.level`, `@table.<column>` / `@table.<column>[level]` (owning
class's table), `@class.<id>.table.<column>`, `@resource.<id>.max|used|remaining`,
`@stat.<id>`, `@condition.<id>.level`, `@hp.current`, `@value` (transforms),
`@spell.level` / `@slotLevel` (spell formulas), and any stat path
(`@ac`, `@skill.stealth`, `@save.dex`, `@speed.fly`…).

Example: Rage uses → `@table.rageUses[@class.barbarian.level]`;
Cursed Energy pool → `@class.jujutsu.level * 2 + @wis.mod`.

The formula editor shows a live preview against the current character and
validates references as you type.

## 4. Classes, level tables and choices

```ts
interface ClassDef {
  id; name; hitDie; primaryAbility; saves; skillChoice
  armorProficiencies; weaponProficiencies; toolProficiencies
  startingEquipment; multiclassRequirements?
  subclassLevel: number; subclassLabel: string        // "Cursed Lineage"
  columns: TableColumnDef[]                            // class table columns (Martial Arts die, Rages, Cursed Energy…)
  levels: { level: number; features: FeatureDef[] }[]  // 1–20
  spellcasting?: SpellcastingDef
}

interface FeatureDef { id; name; description; effects: Effect[] }
interface ChoiceDef  { id; label; count: Formula; from: OptionSource; prerequisite?: Condition; replaceableOn?: 'levelUp' | 'longRest' }
```

- ASIs become a feature whose effect is a `grantChoice` from the built-in
  "ASI or feat" option source — not a special case.
- Metamagic, Invocations, Fighting Styles, Favoured Enemy, Dragon Ancestor
  etc. all become `optionLists` + `grantChoice`. This removes every
  `isXxxClass` branch; the level-up popup and Features tab render any choice
  generically.
- `SpellcastingDef`: ability, full/half/third/pact/none/custom slot table,
  known vs prepared (with a limit formula), spell list (by class tag or an
  explicit list), ritual casting, spellbook mode, and a renameable label.

## 5. Resources, actions and toggles

- **Resource**: `{ id, name, max: Formula, recharge: 'short' | 'long' | 'dawn' | 'turn' | 'none' | Formula-gated by level, regain?: Formula }`.
  Pools and uses are the same thing with a display hint.
- **Action**: name, action economy (action / bonus / reaction / free /
  custom pack-defined), cost (resource + amount formula), roll (attack or
  save DC formula + damage dice), effects applied while active, duration.
- **Toggle**: an on/off state (Rage, Reckless Attack, Domain Expansion) whose
  effects apply via the `toggle active` condition.

## 6. Items and spells

- Items: one `ItemDef` with category, rarity, cost, weight, attunement,
  weapon fields (dice, type, properties, range, mastery), armour fields (base
  AC formula, dex cap, strength requirement, stealth), charges (a resource),
  and `effects` active while equipped / attuned / always.
- Spells: all current fields plus damage/healing rolls, save ability,
  attack type, upcast scaling formula, class tags, and effects applied while
  the spell is active (e.g. Mage Armor → `acFormula`).
- Custom weapon properties and spell schools are vocabulary entries.

## 7. Terminology layer

`TerminologyOverrides` maps core concept keys to labels:
`spellSlots`, `spells`, `cantrips`, `spellcasting`, `hitDice`, `subclass`,
`species`, `background`, each ability name/abbreviation, each skill, each
action economy, currency names, `proficiencyBonus`, etc. The UI reads every
label through `term('spellSlots')`. Mechanics are unchanged by renaming. If
two enabled packs rename the same key, the DM picks which wins in campaign
settings.

## 8. Characters

- Sheets reference content by namespaced id (`srd-5.2.1:monk`) instead of
  name. A one-time migration maps existing names → SRD pack ids; unmatched
  names (today's freeform homebrew classes) are converted into a generated
  personal pack so nothing is lost.
- Sheets record which pack versions they were built against. If a pack is
  missing or disabled, its entries show as a stub with a warning instead of
  erroring, and come back when the pack is enabled again.
- Today's per-sheet custom spells/items/features remain supported and can be
  "promoted" into a pack.

## 9. Authoring UI

- A **Homebrew Workshop** screen: library of packs → pack overview → editors
  for each entry type (forms with an effect builder, formula fields with live
  preview, level-table grid for classes).
- **Test character** panel: apply the pack to a scratch character at any
  level and see the derived sheet, to check a class before players use it.
- Codex shows enabled packs' content with a source badge and a pack filter.
- A raw JSON view for power users, validated against the same schema.

## 10. Phases

Each phase ships on its own and leaves the app working.

1. **Foundations** — add Vitest; snapshot today's derived numbers for a
   matrix of SRD characters (every class at 1/5/11/20, multiclass, common
   feats/armour) as the regression baseline. Define pack/effect/formula
   types + JSON schema; build the formula parser and `deriveCharacter`.
2. **SRD as a pack** — convert races, classes, subclasses, backgrounds,
   feats, resources, toggles, option lists, spells and items into the
   `srd-5.2.1` pack; switch calculations to `deriveCharacter`; delete
   hard-coded class branches. Must match the phase-1 baseline exactly.
3. **Generic choices UI** — Features tab and level-up popup render choices,
   resources, actions and toggles generically; remove `isXxxClass` paths.
4. **Character migration** — name → id migration, pack-version tracking,
   missing-pack stubs.
5. **Pack storage & sync** — local library, campaign enablement (DM only),
   session-protocol requests, offline snapshot, import/export.
6. **Homebrew Workshop** — editors, effect builder, formula preview, test
   character, Codex integration.
7. **Terminology & vocabulary** — `term()` across the UI, custom skills,
   damage types, conditions, currencies, stats.
8. **Monsters** — move custom monsters out of localStorage into packs.

Phases 1–4 are invisible to users but are where the risk is. Every phase-2
change is checked against the regression snapshots.

## Phase 1 — status and notes for phase 2

Built: `shared/content/` — `schema.ts` (zod pack format), `formula.ts`
(parser/evaluator), `registry.ts` (pack merge), `engine.ts`
(`deriveCharacter`), `validate.ts` (import validation). Tests in
`tests/content/` use two fixture packs: a trimmed 5e core written purely as
pack data, and a JJK-style pack on top of it. `tests/regression/` snapshots
what the sheet shows today for 166 SRD characters (`legacyDerive.ts`
mirrors OverviewTab/CombatTab/SpellsTab).

Known differences phase 2 must decide on deliberately (they'll show as
snapshot diffs once the SRD pack is compared against the baseline):

- **Feats that are only notes today** — Archery (+2 ranged), Defense (+1 AC
  in armour, partially automated), Alert (+prof initiative) — are fully
  expressible now. Automating them is a rules improvement, so the snapshot
  update should be its own commit.
- **Weapon proficiency**: the legacy sheet assumes every weapon is
  proficient; the engine checks class weapon proficiencies (a Wizard with a
  longsword loses +prof). Either accept the fix or grant `weapon: all` in
  the adapter for parity first.
- **Spellcasting ability**: legacy uses only the sheet's stored ability;
  the engine falls back to the first casting class when the build leaves it
  `undefined`. The adapter should pass the sheet value through (including
  `null`).
- **Skill ids**: legacy keys skills by display name ("Sleight of Hand"); the
  SRD pack should use ids and the phase 4 migration maps them.
- **Multiclass spell slots** are summed per class, same as legacy — the
  real multiclass caster table is a later, deliberate rules change.

## Phase 2 — status and notes for phase 3

Built:

- `shared/content/srd/` — the `srd-5.2.1` pack, generated at import from
  `dnd5e.ts`, `compendium.ts` and `shared/data/` (`srdPack()` parses and
  caches it; `buildSrdPackInput()` is the raw input). It passes
  `validatePack` with no issues. Everything those modules decide in code is
  pack data now: class tables and resources as formulas, Rage as a toggle
  that spends its resource, Reckless Attack as a free toggle, resource
  actions, Unarmored Defense/Movement and Primal Champion as effects,
  spellcasting configs from the slot/known/cantrip tables (Pact Magic is its
  own `pact` pool), Champion's Additional Fighting Style as a choice,
  grouped subclass options as option lists (Circle of the Land grants its
  spells by level), species lineages, backgrounds, feats, armour AC /
  Strength requirement / Stealth as item effects, and exhaustion as a graded
  condition.
- `shared/content/legacy.ts` — `legacySheetToBuild(sheet)` reads today's
  `CharacterSheetData` as a `CharacterBuild` plus packs. It mirrors legacy
  semantics: only active picks count, unrecognised class names become stub
  classes in a generated `legacy-homebrew` pack (levels, no hit points,
  placed after the known classes so the first known class keeps its full
  first hit die), level-0 slots go to the background (or Human's Versatile),
  and any pick with nowhere to go becomes a per-sheet custom effect so it
  still counts.
- `engine.ts` exports `choiceKeys`, the one place choice/pick keys are built.
- Tests: `tests/regression/parity.test.ts` runs all 166 fixtures through
  adapter → `deriveCharacter` → `project.ts` (DerivedCharacter →
  LegacyDerived). Its snapshot started as a renamed copy of the baseline, so
  `diff` the two snapshot files to see every deliberate difference. A second
  test compares every class at levels 1–20 against live `legacyDerive` with
  legacy-compatible options. `tests/content/legacy.test.ts` covers the
  adapter paths the fixtures don't.

Deliberate differences from the baseline, one commit each:

| Change | Fixtures affected |
| --- | --- |
| Defense: its note is gone (the +1 AC in armour was already applied) | 15 |
| Archery: +2 to ranged weapon attacks, the "add by hand" note is gone | 11 rangers (Longbow) |
| Alert: + proficiency bonus to Initiative (the swap stays a note) | 1 |
| Weapon proficiency comes from class proficiencies (`assumeWeaponProficiency: true` restores the old behaviour) | 12 bards (Rapier is martial; the 5.2.1 Bard has simple weapons only) |

Decided against:

- **Spellcasting-ability fallback**: the adapter passes the sheet's stored
  ability through, including `null`. The sheet field is the player's
  explicit choice, so it wins; the engine's fallback only applies to builds
  that leave it `undefined` (future pack-native characters).
- **Multiclass spell slots** stay summed per class, as before.

Still the same as legacy, though the engine can now express them (each is
a rules change for its own commit): Martial Arts (die, Dex for monk
weapons), Fast Movement, Roving, Body and Mind, Slippery Mind and
Disciplined Survivor save proficiencies, Draconic Resilience, Dwarven
Toughness, Wood Elf / Drow speed and Darkvision, Rage not working in heavy
armour, Reckless Attack applying only to Strength melee attacks, and
magic-item mechanics (magic items are rules text only).

Notes for phase 3:

- Phase 2 in §10 also says "switch calculations to `deriveCharacter`;
  delete hard-coded class branches". That hasn't happened: no UI reads the
  engine yet, and the pack is still generated from the legacy modules.
  Switching the tabs over (using the adapter until phase 4) and then
  moving the SRD data into the pack itself, so the legacy helpers can be
  deleted, is the next step.
- The pack only has choices where today's sheet records a pick (ASIs,
  Fighting Styles, Epic Boons, Metamagic, Invocations, Mystic Arcanum,
  Spell Mastery, Signature Spells, Magical Secrets, subclass options,
  lineages, background picks). Expertise, Skillful and similar picks still
  live directly on the sheet's skills; add choices for them in phase 4,
  when the migration can fill them.
- A toggle with a `cost` is what the legacy sheet calls an activatable
  resource (`activeBuffs`). Its id is the resource id, so `activeBuffs`
  maps straight to `activeToggles`.
- Legacy-only data is kept rather than dropped: the 2014 Favored
  Enemy/Terrain picks become option-list choices on a per-sheet custom
  effect, and Divine Sense (tracked by the sheet but absent from the 5.2.1
  table) is its own Paladin level-1 feature.
