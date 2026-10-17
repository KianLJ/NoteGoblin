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
3. **Engine reads** (done) — every tab, the initiative tracker, the
   force-roll prompt, inventory and character creation read their numbers
   from `deriveCharacter` (via the phase 2 adapter) instead of the legacy
   helpers. Reordered ahead of the generic choices UI: that UI needs
   native pick storage, which is the migration's job.
4. **Character migration** — name → id migration, native `choices` on the
   sheet, pack-version tracking, missing-pack stubs. Then the **generic
   choices UI**: Features tab and level-up popup render choices,
   resources, actions and toggles generically; remove `isXxxClass` paths
   and the legacy helpers in `dnd5e.ts` / `compendium.ts`.
5. **Pack storage & sync** — local library, campaign enablement (DM only),
   session-protocol requests, offline snapshot, import/export.
6. **Homebrew Workshop** — editors, effect builder, formula preview, test
   character, Codex integration.
7. **Terminology & vocabulary** — `term()` across the UI, custom skills,
   damage types, conditions, currencies, stats.
8. **Monsters** — move custom monsters out of localStorage into packs.

Phases 1, 2 and 4 are invisible to users but are where the risk is; phase 3
ships the rules fixes listed in the phase 2 notes. Every phase-2
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

## Phase 3 — status and notes for phase 4

Done: `shared/content/sheet.ts` is the app's single entry point —
`deriveSheet(sheet)` runs `legacySheetToBuild` → `deriveCharacter`,
cached per sheet object (and the registry per pack set), plus small
readers that take legacy keys (`skillOf(derived, 'Sleight of Hand')`).
React tabs use `useDerivedSheet(liveSheet)`, where `liveSheet` is the saved
character with the tab's unsaved draft merged on top, so edits show
before they save.

Switched over: OverviewTab (abilities, saves, skills, passive Perception,
AC, initiative, speed, max HP and level-up HP deltas, notes, rests,
resistances/immunities/vulnerabilities), CombatTab (every attack incl.
granted ones and per-attack advantage, toggles, resources, actions,
cantrip DC/attack), SpellsTab (slots, DC, attack, caps), FeaturesTab's
resource cards, ForceRollPrompt, InitiativeTracker (HP, AC, initiative —
now including Alert), InventoryTab carrying capacity, the level-up
popup's chooser scores, and character creation's starting HP.

Engine output gained `className` and `detail` (the granting feature's
full text) on resources, toggles and actions, for the cards.

Behaviour changes users will see, beyond the phase 2 rules fixes:

- Activating a toggle spends its full cost from its resource, for pool
  resources too (legacy only spent from "uses" resources — no pool buff
  existed, but homebrew ones will).
- Rests refill `dawn`-recharge resources on a long rest.
- Granted resistances/immunities/vulnerabilities (species, items,
  homebrew) appear as read-only tags, not just Rage's.
- A weapon the character isn't proficient with shows a "Not proficient"
  tag (follows from the weapon-proficiency fix).
- Forced rolls now include exhaustion's disadvantage, matching the sheet.

Still on legacy code (structure, not numbers): which features, choosers
and reactions exist (FeaturesTab, LevelUpPopup, AsiChoosers,
ClassTableTab, CombatTab's reaction list and Divine Smite card), the
wizard's review-step preview (AC/HP/speed shown before the sheet
exists), and custom attacks stored on the sheet (`attacks`, not part of
the build). Hit-dice pools still come from `CLASSES`.

Not checked in the running app: signing in needs either your existing
dev profile's password or a new account, and creating one also syncs it
to the online relay. Check by hand: `npm run dev`, open a few characters
(a raging barbarian, a caster, a multiclass), and compare against the
numbers before this change.

## Phase 4a — status and notes for 4b

Done: sheet format v2 (`shared/content/migrate.ts`). All new fields are
optional and additive — `sheetVersion`, `speciesId`, `backgroundId`,
`ClassLevel.classId` / `subclassId`, `choices` and `packVersions` — so
older app versions keep reading the name-based fields, and saves (shallow
patches) never drop fields an older version doesn't know.

- `normalizeSheet(sheet, packs)` fills ids from names, keeps legacy fields
  untouched, and returns the same object when nothing changes. Names win:
  the UI still edits classes/species/backgrounds by name, so an id that no
  longer matches its name is re-resolved — except an id into a pack that
  isn't enabled, which is kept so disabling a pack never loses it.
- Runs on every read (`toCharacterSheet` in registerIpc.ts, and
  `deriveSheet` for DM-side copies and offline snapshots) and on every save
  (`characterRepo.create/update`, after the patch merges), which is where a
  sheet is actually written as v2.
- `packVersions` records the version of each pack an id points into *when
  first seen*; `changedPacks()` reports a pack that has since moved on and
  `acknowledgePackVersions()` is the patch to accept it (UI in phase 5).
  `missingPacks()` lists packs a sheet needs that aren't enabled.
- The adapter prefers ids, accepts extra enabled packs
  (`legacySheetToBuild(sheet, { packs })`), turns a class from a missing
  pack into a level-keeping stub with a warning in the sheet diagnostics,
  and applies `sheet.choices` as an override layer: for any choice key
  present there, native picks win over the legacy fields.
- The generated `legacy-homebrew` pack's version encodes its class names,
  since registries are now cached by pack id + version.

Notes for 4b (generic choices UI, with dual-write):

- Write picks to `choices` (keys from `choiceKeys`, options from
  `DerivedChoice.options`). For SRD picks that have a legacy equivalent,
  also mirror them into `asiSlotChoices` / `subclassFeatureChoices` /
  `raceLineageChoice` so older clients still show them — the adapter's
  `Adapter.fillFeat` / `placeFeatureChoice` mapping is the inverse to
  write. Homebrew-only picks are native-only.
- Removing a pick must clear both the native key and its legacy mirror,
  or the legacy value reappears once the native key is gone.
- An older client editing a legacy pick whose key also has a native pick
  will be shadowed by the native one — acceptable for the dual-write
  window; drop the mirroring (and then the legacy fields) in a later
  release once old clients have auto-updated.

## Phase 4b — status

Done: the Features tab, the level-up popup and the species prompt on
Overview render every choice generically from the engine — no class,
feat or species is special-cased any more.

- `src/renderer/src/features/player/ChoiceCards.tsx`: `ChoiceCard` (pick
  chips, searchable picker, prerequisites shown but not selectable,
  repeats, freeform, nested choices underneath), `ChoiceList`, and
  `useChoiceEditor`, which saves through `choicePatch`.
- `shared/content/legacyMirror.ts`: `choicePatch(sheet, derived, choice,
  picks)` writes native picks (dropping picks nested under anything
  removed) and, for SRD choices, mirrors them into the legacy fields in
  exactly the old choosers' shapes — ASI/feat slots (incl. Magic Initiate's
  spells), subclass options, Metamagic (one choice per granting level),
  invocations, Mystic Arcanum / Spell Mastery / Signature Spells / Magical
  Secrets (incl. its free spells), level-0 origin slots and the lineage.
  Records for class levels the character no longer has are untouched. A
  round-trip test re-mirrors every pick of all 172 test characters and
  checks the legacy fields come back identical.
- Engine: `DerivedChoice` gained `sourceKey`, `parentKey`, `level`,
  `classId`, `className` (level carried down through nested picks).
- The Spells tab lists engine-granted spells (Circle Spells, lineage
  spells, homebrew grants) that aren't stored on the sheet, marked
  "Granted" and not removable there.
- Deleted: the class-specific choosers (Fighting Style, named-option,
  Favored Enemy, subclass-option, Circle Spells grant, Magical Secrets,
  lineage-spell grant), the per-class branches in FeaturesTab /
  LevelUpPopup, and ten legacy helpers with no callers left.

What users will notice:

- ASIs are two steps: pick "Ability Score Improvement" (or a feat) at the
  slot, then the two +1s (the same ability twice = +2).
- Circle Spells and lineage spells appear automatically instead of behind
  a "grant" button; the Feats section is gone (each feat shows on the card
  of the choice that picked it).
- 2014 Favored Enemy/Terrain picks show read-only under "Other Picks".

Still legacy: character creation (`CharacterCreationWizard` with
`AsiSlotChooser` / `OriginFeatChooser`, writing legacy fields the adapter
reads), the subclass pick (by name on the class entry), and the Divine
Smite card (spending a spell slot isn't an engine concept yet). Skillful
picks are native-only, so older clients don't show them. The SRD pack is
still generated from `dnd5e.ts` / `compendium.ts` at import, so most legacy
helpers stay until the pack is stored as data. Next: phase 5 (pack storage
and sync).

## Phase 5 — status and notes for phase 6

Done: pack storage and sync.

- **Library** — `content_packs` in local.sqlite3 (per identity, one row per
  pack id; re-importing an id replaces it). `PackLibraryRepo`; IPC
  `packs.list/import/exportPack/remove` (native file dialogs; import
  validates every file with `readPackFile`, reporting warnings and
  per-file failures). Removing a pack never touches a campaign's copy.
- **Campaigns** — `campaign_packs` in host.sqlite3: the DM's copy of each
  enabled pack as enabled, in load order. `listCampaignPacks` (members),
  `enableCampaignPack` / `disableCampaignPack` (DM only). Enabling an
  already-enabled id is the explicit **update** — it copies the library's
  current version; nothing changes on its own. Enable is refused until the
  pack's dependencies are enabled; disable is refused while another enabled
  pack depends on it. Changes broadcast `campaign-changed`. Deleting a
  campaign removes its rows.
- **Players** — new session request `campaignPacks.list`; the player
  workspace fetches packs alongside notes/folders/decks and stores them in
  the offline snapshot (`cached_campaigns.packs_json`), so sheets still
  derive with them when the DM isn't hosting.
- **Which packs apply** — `shared/content/sheet.ts` holds the active pack
  set (`setActivePacks` / `subscribeActivePacks`); `deriveSheet` and
  `useDerivedSheet` use it, cached per sheet + pack set. `AppShell` applies
  the open campaign's packs (DM's own campaign, or the joined/offline one)
  and the whole library otherwise (`useApplyActivePacks`).
- **Saved ids** — the main process normalizes sheets against every pack the
  machine knows (SRD, library, cached and hosted campaign packs —
  `knownPacks` in registerIpc.ts), so homebrew ids are written to disk and
  survive a pack being disabled.
- **UI** — a Content Packs button in the header opens `ContentPacksModal`:
  the open campaign's packs (DM: enable / update / disable; player:
  read-only) and the library (import / export / remove).
- `shared/content/packFiles.ts` holds the pure rules (file reading/writing,
  enable/disable checks), all unit-tested; the new SQL was exercised
  against real SQLite (library upsert, snapshot column migration, campaign
  upsert keeping position, disable).

Not yet: packs in the Codex and the add-spell/item pickers (they still
list SRD data only — phase 6), the `changedPacks` "this pack was updated"
prompt on sheets, the DM's cross-device relay snapshot (campaign packs
aren't pushed to the relay with notes/folders yet), and an in-app way for
a player to send a pack to the DM (export/import for now). Next: phase 6,
the Homebrew Workshop.

## Engine additions — universal pack features

Added so a full third-party book (the JJK 5e test case) converts without
special cases. Everything below is generic pack data; nothing is keyed to
one pack. Tests: `tests/content/engineAdditions.test.ts`,
`tests/content/resourceMath.test.ts`.

- **Archetypes** (`pack.archetypes`, entry kind `archetypes`) — leveled
  feature sets any class, species, background or feat can grant through a
  choice `from: { kind: 'archetypes', tags?, archetypeIds? }` (innate
  techniques, bloodlines, cross-class patrons). `levelBasis`:
  `grantingClass` (default), `highestClass` or `character`. `unique`
  (default true) blocks taking the same one twice. Inside one,
  `@archetypeLevel` is its level and `@table.<col>` reads its own columns;
  elsewhere `@archetype.<id>.level`. Its features carry `archetypeId`, and
  the Features tab, class table and level-up recap list them under the
  class that granted them. Nested choices hang off the pick as usual.
- **Variable spend** — `action.spend { resourceId, min?, max }`; every
  action formula reads the chosen amount as `@spent`. The engine returns
  the numbers at `min` plus a `scaling` row per amount (capped at 40); the
  Actions tab shows a slider.
- **Restores and temporary points** — `action.restores[] { resourceId,
  amount, temporary? }` refills spent points or adds temporary ones on top
  of the max (`sheet.resourceTemp`, spent first, cleared by any rest);
  `action.tempHp`; `resource.shortRestRegain` gives part of a long-rest
  pool back on a short rest. `@resource.<id>.temp`; `remaining` includes
  temp. Spending and rest rules live in `shared/content/resourceMath.ts`.
- **Point-buy choices** — `choice.budget` (formula), `option.cost`
  (default 1), `option.group` + `choice.groups[{ id, label, max }]`.
  Derived choices report `budget`, `spent`, `groups` and per-option
  `blocked` reasons; `remaining` is points left. Overspending or going over
  a group cap is a warning, never a hard block.
- **Counters** (`vocabulary.counters`) — numbers kept on the sheet
  (`sheet.counters`), clamped to `min`/`max`, read as `@counter.<id>`.
- **Ability aliases** (`vocabulary.abilityAliases`) — "the CE ability is
  Wis or Cha": `@alias.<id>.mod|score`, and `modify alias.<id>.score`
  raises the chosen ability. The pick is `sheet.abilityAliases`.
- **Companions** — effect `grantCompanion { companion }` with owner-scaled
  formulas plus `@self.<ability>.mod|score`; state (summoned / dismissed /
  defeated / pack states) and current HP in `sheet.companionStates`;
  summoning pays `summonCost`.
- **New stats/effects** — `damageReduction { amount, damageTypes?, label? }`,
  `crit.threshold` (20), `reactions` (1), `attacks.perAction` (1),
  `sense.<id>` (darkvision, blindsight, tremorsense, truesight plus
  `vocabulary.senses`), `@highestClassLevel`, `class.multiclass: 'never'`
  and the `multiclassPrerequisite` check (both warnings).
- **Sheet** — Overview shows aliases, counters, displayed custom stats,
  senses, changed combat numbers and damage reduction
  (`PackTraitsSection`); the Actions tab has the spend slider, restores,
  temp points, short-rest regain and a Companions section.

Not yet: the Homebrew Workshop editors for these (phase 6), and applying
damage reduction automatically when damage is taken (it is displayed).

## Phase 6a — status and notes for 6b

Done: the Homebrew Workshop shell, raw editing, testing and browsing.

- **Workshop mode** — a third button (hammer) beside DM and Player mode in
  the header. It covers the workspace without unmounting it, so a hosted
  or joined session carries on underneath (`AppShell` `workshopOpen`).
- **Library editing** — `features/workshop/Workshop.tsx`: the library on
  the left (New pack, Import), the selected pack's editor on the right.
  Drafts are kept per pack while the Workshop is open; nothing is stored
  until Save. New IPC `packs.save(pack, previousId?)` validates in the
  main process (`readPackFile` against the rest of the library) and
  refuses a pack with errors or an id clash; a changed id replaces the old
  row. Campaign copies never change from here — the DM updates them in
  Content Packs as before.
- **Pack editor** (`PackEditor.tsx`) — Overview (name, id, version with
  patch/minor/major bump, author, description, which packs it builds on,
  per-kind counts, every problem, click to jump to it), Entries (every
  entry of every kind as JSON, add from a template that validates,
  duplicate, delete, per-entry problems), Vocabulary & terms, Test
  character, Raw JSON. Validation re-runs 300 ms after typing stops.
- **Test character** (`TestCharacterPanel.tsx`) — class, level, subclass,
  species, background and scores; derives with the SRD, the pack's
  dependencies and the pack (`packsForTesting`), using the last version
  that validated. Shows every number, choices (pickable), toggles,
  features, resources, actions with spend ranges, companions and all
  diagnostics. Nothing is saved.
- **Codex** — a Homebrew category (shown when the active packs add
  anything) lists every pack entry with its pack, filtered by kind and
  pack (`shared/content/codexContent.ts`).
- **Pickers** — the Spells tab's picker offers pack spells (copied onto
  the sheet with `packSpellId`); the Inventory tab has "Add Homebrew Item"
  (`packItemId`, which the legacy adapter prefers, so the engine applies
  the item's attacks, AC and effects when equipped).
- Pure rules in `shared/content/workshop.ts`, tested in
  `tests/content/workshop.test.ts`.

Next (6b): form editors for every entry kind, the effect builder, formula
fields with a live preview, and the level-table grid for classes.

## Phase 6b — status

Done: form editors for everything a pack holds.

- **Form / JSON** — every entry (and the vocabulary and terminology) has
  a Form view and the JSON view from 6a; both edit the same draft, the
  forms keep keys they don't know, and emptied optional fields are
  dropped, so switching never loses anything. Monsters stay JSON-only
  until phase 8.
- **Entry forms** (`features/workshop/form/entries.tsx`) — class (hit
  points, proficiencies, skill choices, subclass and multiclass rules,
  spellcasting, progression), subclass, archetype (tags, level basis,
  unique, prerequisite), species (speeds, traits), background, feat,
  option list (options with point cost, group, prerequisite, effects),
  spell (casting, rolls, ongoing effects), item (weapon, armor, charges,
  when effects apply).
- **Level-table grid** (`form/levels.tsx`) — one row per level with the
  table columns as editable cells (numbers or text such as dice) and the
  level's features; clicking a level opens its feature editor.
- **Effect builder** (`form/effects.tsx`) — every effect kind, an
  optional "only when" condition (`form/conditions.tsx`: every condition
  kind, nested all / any / not, item and attack filters), and full
  editors for granted resources, actions (fixed cost, variable spend,
  restores), toggles, attacks, choices (every option source, point-buy
  groups, on-pick effects), companions and spellcasting (with a slot
  grid).
- **Formula fields** — syntax checked as you type and previewed live
  against the test character (`deriveCharacter(..., { keepEvaluator })`
  → `evaluate(probe)`; probes can sit in class or archetype scope and get
  sample @spent / @slotLevel / @self values). Editing a class or subclass
  previews as that class. A help mark lists the references.
- **Suggestions** — inputs for ids offer the pack's and its
  dependencies' classes, spells, feats, option lists, archetypes and
  tags, skills, damage types, conditions, the resources and toggles the
  draft grants, stat paths and roll targets (`suggestionLists`).
- The test character's setup now lives on the pack editor and is shared
  with the previews.

Not yet: monsters as forms (phase 8), a guided "new class" wizard, and
drag-and-drop reordering (rows move with up/down buttons).

## Phase 7 — status

Done: terminology and vocabulary across the UI.

- **`term()`** — `shared/content/terms.ts` (`termsFor`, `TERM_DEFAULTS`)
  and the renderer hook `useTerms()` (`features/content/terms.ts`), over
  the active packs' merged terminology. The character sheet uses it for
  species, subclass, proficiency, inspiration, AC, initiative, speed,
  saving throws, skills, ability names (and `ability.<id>.short`), spell
  slots, cantrips, spells, hit dice and background; the creator for its
  step names and abilities; the Actions tab for action types
  (`actionType.<id>`); the inventory for currencies (`currency.<id>`).
  The Workshop's terminology form suggests every key.
- **Conflicts** — `terminologyConflicts`: the Content Packs window lists
  concepts two enabled packs rename differently and which wins. The DM
  chooses by reordering the campaign's packs (new up/down buttons; IPC
  `campaignPacks.move`, `CampaignPackRepo.move`); later packs win, and
  dependencies still load first.
- **Vocabulary on the sheet** — pack conditions can be put on a character
  from the Overview's pack card (`sheet.activeConditions`, with levels for
  leveled ones; their effects apply through the legacy adapter); pack
  currencies get their own inventory fields (`sheet.packCurrency`); pack
  damage types are suggested when adding resistances. Custom skills and
  stats were already shown (engine additions).
- **Cache fix** — registries and the active-pack key were cached by
  pack id + version, so a Workshop save without a version bump kept the
  old content. They now use a content key (`packKey.ts`).

## Phase 8 — status

Done: monsters in packs.

- Pack monsters are statblocks with an id (`shared/content/monsters.ts`:
  `packMonsterRecords`, `monsterEntry`). The Codex, encounter builder,
  initiative tracker, session decks and the note statblock autocomplete
  read `loadAllMonsters()` / `useAllMonsters()`
  (`renderer/src/data/packMonsters.ts`): this device's old custom list,
  every library pack plus the open campaign's packs, then the SRD.
- "Save to Bestiary" now saves into the personal **My Creatures** pack
  (`my-creatures`, created on first save), falling back to the old local
  list if the pack can't be written. Its creatures can be deleted from
  the Codex.
- The Codex offers to move creatures saved only on this device into My
  Creatures; each keeps its old index, so saved encounters still find it.
- The Workshop has a monster form (statblock fields, ability scores,
  details, traits / actions / reactions / legendary actions) with a live
  statblock preview, and a monster template.

Not yet: monster effects (resistances and attacks as engine effects, so
an encounter could derive numbers the way sheets do) — statblocks stay
text.
