# Turning a homebrew campaign into a NoteGoblin pack

Paste everything below the line into the conversation where you worked out
your homebrew with Claude. It turns what you discussed into a content pack
file you can import in NoteGoblin's Homebrew Workshop (the hammer button →
Import…). Claude writes the file; the Workshop checks it and points at
anything to fix.

---

You are converting the homebrew we designed in this conversation into a **NoteGoblin content pack**: one JSON file in the format below. NoteGoblin's character sheet calculates everything from this file, so the rules must be expressed as data (effects and formulas), not only described in text.

## What to do

1. List what we designed that belongs in a pack: classes (with their level tables), subclasses, archetypes (feature sets any class can take, like bloodlines), species, backgrounds, feats, option lists (pick-one-of lists such as fighting styles), spells, items, creatures, and new rules vocabulary (custom skills, stats, counters, conditions, damage types, currencies, renamed terms). Ask me about anything ambiguous before writing, especially numbers we never settled.
2. Write the pack as **one JSON object**, in a single code block, following the format reference. Use only the fields and kinds listed; don't invent new ones.
3. Every rule the sheet can calculate becomes an **effect**: bonuses, proficiencies, resistances, pools of points, actions, toggles, attacks, choices, spells, companions. Put each feature's full rules text in its `description` too, so players can read it.
4. Rules the sheet can't calculate (narrative abilities, "once per scene" judgement calls) stay as description text, optionally with a `note` effect as a reminder.
5. After the JSON, list briefly: anything you couldn't express as effects, and any assumptions you made.

## Format reference

### The pack

```
{
  "formatVersion": 1,
  "id": "my-campaign",              // letters, digits, - _ . only; never change it later
  "name": "My Campaign",
  "version": "0.1.0",
  "author": "",
  "description": "",
  "dependsOn": ["srd-5.2.1"],       // builds on the standard 5e rules (SRD)
  "hides": [],                      // SRD entries to remove, e.g. ["srd-5.2.1:alert"]
  "terminology": {},                // renames, see below
  "vocabulary": {},                 // new skills, stats, counters…, see below
  "classes": [], "subclasses": [], "archetypes": [], "species": [], "backgrounds": [],
  "feats": [], "optionLists": [], "spells": [], "items": [], "monsters": []
}
```

Every entry has `id` (lower-case-with-hyphens, unique within its kind), `name` and `description`. To replace an SRD entry rather than add one, add `"overrides": "srd-5.2.1:longsword"`. Entries in this pack refer to each other by their local id ("ember-knight"); SRD entries are "srd-5.2.1:<id>".

SRD ids you can use: classes `barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard`; skills `acrobatics animal-handling arcana athletics deception history insight intimidation investigation medicine nature perception performance persuasion religion sleight-of-hand stealth survival`; damage types `acid bludgeoning cold fire force lightning necrotic piercing poison psychic radiant slashing thunder`; feat categories `Origin General "Fighting Style" "Epic Boon"` (origin feats: `alert magic-initiate savage-attacker skilled`); abilities `str dex con int wis cha`; action types `action bonus reaction free`; recharge `short long dawn turn none`.

### Entries

- **Class**: `hitDie` (number), `saves` (abilities), `primaryAbilities`, `armorProficiencies` (light medium heavy shield), `weaponProficiencies` (simple martial…), `toolProficiencies`, `skillChoice: { "count": 2, "from": ["athletics", "perception"] }`, `subclassLevel` (default 3), `subclassLabel` ("Oath"), `multiclass` ("allowed" or "never"), `spellcasting` (below), `columns` and `levels` (below). Optional `hpFirstLevel` / `hpPerLevel` formulas.
- **Level table**: `columns: [{ "id": "embers", "label": "Embers", "values": [2, 2, 3, …20 values] }]` (numbers, or text like "1d6"; read in formulas as `@table.embers`), and `levels: [{ "level": 1, "features": [ <feature> ] }]`.
- **Feature**: `{ "id", "name", "description", "effects": [ <effect> ] }`.
- **Subclass**: `classId` (the class's id), plus `columns`, `levels`, optional `spellcasting`.
- **Archetype** (a feature set any class can take): `tags` (["bloodline"]), `levelBasis` ("grantingClass", "highestClass" or "character"), `unique` (default true), optional `prerequisite` (a condition), `columns`, `levels`. Granted by a choice: `{ "from": { "kind": "archetypes", "tags": ["bloodline"] } }`.
- **Species**: `size`, `speed: { "walk": "30", "fly": "30" }`, `traits` (features).
- **Background**: `features` (features). The standard pattern grants an origin feat with a choice: `{ "kind": "grantChoice", "choice": { "id": "feat", "label": "Origin feat", "from": { "kind": "feats", "featIds": ["alert"] } } }`.
- **Feat**: `category` ("General", "Origin", or your own), `prerequisiteText`, optional `prerequisite` (a condition), `repeatable`, `effects`.
- **Option list**: `options: [{ "id", "name", "description", "effects", "prerequisite"?, "cost"?, "group"? }]` (cost and group are for point-buy choices).
- **Spell**: `level` (0 = cantrip), `school`, `castingTime`, `range`, `components`, `duration`, `concentration`, `ritual`, `lists` (class ids whose spell list includes it), `higherLevel`, `attackType` ("melee"/"ranged"), `saveAbility`, `damage` (formula, can use `@slotLevel`), `damageType`, `healing`, and `effects` (applied while the spell is active).
- **Item**: `category`, `rarity`, `cost`, `weight`, `requiresAttunement`, `effectsWhen` ("equipped", "attuned", "carried"), optional `weapon: { "category", "range": "melee", "damage": "1d8", "damageType": "slashing", "properties": [] }`, optional `armor: { "category": "light" }` (its AC goes in effects as an AC formula), optional `charges` (a resource), `effects`.
- **Monster** (a statblock; all values are text): `size`, `type`, `alignment`, `ac`, `initiative` ("+2 (12)"), `hp`, `speed`, `str dex con int wis cha`, `saves`, `skills`, `damage_resistances`, `damage_immunities`, `condition_immunities`, `senses`, `languages`, `cr`, and `traits` / `actions` / `bonus_actions` / `reactions` / `legendary_actions` / `lair_actions` as `[{ "name", "desc" }]`.
- **Spellcasting** (class or subclass): `{ "ability": "int", "prepared": "max(1, @int.mod + @classLevel)", "cantrips": "@table.cantrips", "slots": { "rows": [[2], [3], [4, 2], …one row per class level] } }`.

### Effects

An effect is `{ "do": <action>, "when": <condition, optional> }`. Actions:

| kind | fields | use it for |
| --- | --- | --- |
| `modify` | `target`, `op` (add, set, multiply, atLeast, atMost, transform), `value` (formula) | any number: `ac`, `hp.max`, `initiative`, `speed.walk`, `ability.str.score`, `save.dex`, `skill.stealth`, `spell.dc`, `attack.bonus`, `attack.damage`, `crit.threshold`, `reactions`, `attacks.perAction`, `sense.darkvision`, `stat.<id>`, `resource.<id>.max` |
| `acFormula` | `label`, `formula` | another way to work out AC, e.g. `10 + @dex.mod + @con.mod` |
| `proficiency` | `category` (skill, save, weapon, armor, tool, language), `value`, `level` (half, proficient, expertise) | proficiencies and expertise |
| `rollMode` | `target` (attack, initiative, deathSave, `check:str`, `save:dex`, `skill:stealth`), `mode` (advantage, disadvantage) | advantage or disadvantage |
| `damageRelation` | `damageType`, `relation` (resistance, immunity, vulnerability) | resistances |
| `conditionImmunity` | `conditionId` | immunity to a condition |
| `damageReduction` | `amount` (formula), `damageTypes` (optional) | less damage from each hit |
| `extraDamage` | `damage`, `damageType` | extra damage on attacks |
| `grantResource` | `resource: { id, name, max (formula), recharge, display ("uses" or "pool"), shortRestRegain? }` | ki, rage uses, mana pools |
| `grantAction` | `action: { id, name, actionType, cost? { resourceId, amount }, spend? { resourceId, min, max }, attackBonus?, saveDc?, saveAbility?, damage?, damageType?, healing?, tempHp?, range?, area?, duration?, restores? [{ resourceId, amount, temporary? }] }` | something the character can do; `spend` lets the player choose how many points, read as `@spent` |
| `grantToggle` | `toggle: { id, name, actionType?, cost?, effects: [ … ] }` | rage, stances, auras (effects apply while on) |
| `grantAttack` | `attack: { id, name, range, abilities: ["str"], damage, damageType }` | natural weapons |
| `grantSpells` | `spellIds`, `alwaysPrepared`?, `free`? | spells always known |
| `grantChoice` | `choice: { id, label, count?, from, onPick?, allowRepeats?, budget?, groups? }` | a pick the player makes (below) |
| `grantCompanion` | `companion: { id, name, ac, hp, speed?, abilities? { str: "14" }, attacks? [{ name, bonus, damage, damageType }], traits?, summonCost? }` | familiars, summons; formulas can use `@self.str.mod` |
| `spellcasting` | `config` (as above) | spellcasting granted by a feature |
| `note` | `text` | a reminder for rules the sheet can't calculate |

**Choice sources** (`from`): `{ "kind": "optionList", "listId" }`, `{ "kind": "feats", "categories": ["General"] }` or `"featIds"`, `{ "kind": "spells", "lists": ["wizard"], "maxLevel": "1" }`, `{ "kind": "abilities" }`, `{ "kind": "skills", "skillIds"? }`, `{ "kind": "archetypes", "tags" }`, `{ "kind": "freeform" }`. In `onPick` effects, `$pick` is replaced by the picked id, e.g. `+1 to an ability of their choice` = `"from": { "kind": "abilities" }, "onPick": [{ "do": { "kind": "modify", "target": "ability.$pick.score", "op": "add", "value": "1" } }]`. Point-buy: `"budget": "@classLevel"` with option `cost`s, and `"groups": [{ "id", "label", "max" }]` capping options by `group`.

**Conditions** (`when`): `{ "kind": "formula", "formula": "@level >= 5" }`, `level` (min, max), `classLevel` (classId, min), `subclass` (subclassId), `toggle` (toggleId), `equipped` (filter: armorCategories, weaponCategories, properties, itemIds), `condition` (conditionId), `hasEntry` (entryId), and `all` / `any` (of: [ … ]) / `not` (of: …).

### Formulas

Numbers are formulas: `@level`, `@prof`, `@str.mod`, `@cha.score`, `@classLevel` (in a class feature), `@table.<column>`, `@class.fighter.level`, `@archetypeLevel`, `@highestClassLevel`, `@stat.<id>`, `@counter.<id>`, `@alias.<id>.mod`, `@resource.<id>.max` / `.remaining`, `@spent` (in a spend action), `@slotLevel` (in spells), `@self.str.mod` (in companions). Functions `floor ceil round abs min max clamp(x, lo, hi)`; comparisons give 1 or 0 (`1 + (@level >= 5)`); `a ? b : c`. Dice: `2d6 + @str.mod`, `(@spent)d8`, `1d@table.die`.

### Vocabulary and terminology

```
"vocabulary": {
  "skills": [{ "id", "name", "ability" }],
  "stats": [{ "id", "name", "base": "formula", "display": true }],
  "counters": [{ "id", "name", "description", "min": 0, "max": "5", "default": 0 }],
  "abilityAliases": [{ "id", "name", "description", "options": ["wis", "cha"], "default": "cha" }],
  "damageTypes": [{ "id", "name" }],
  "conditions": [{ "id", "name", "description", "maxLevel"?, "effects": [] }],
  "senses": [{ "id", "name" }], "actionTypes": [{ "id", "name" }],
  "currencies": [{ "id", "name", "valueInBase": 100 }]
},
"terminology": { "spellSlots": "Mana Wells", "ability.cha": "Presence", "ability.cha.short": "PRE", "subclass": "Order" }
```

Renamable terms: `spellSlots spells cantrips spellcasting hitDice subclass species background proficiencyBonus savingThrows skills inspiration armorClass initiative speed`, `ability.<id>`, `ability.<id>.short`, `currency.<id>`, `actionType.<id>`.

## Example

A small but complete pack, to show the shape. Copy its patterns, not its content.

```json
{
  "formatVersion": 1,
  "id": "emberwild",
  "name": "Emberwild",
  "version": "0.1.0",
  "author": "",
  "description": "A small example pack: the Ember Knight class, a bloodline archetype, a species, a feat and a few more.",
  "dependsOn": ["srd-5.2.1"],
  "terminology": { "subclass": "Oath of Flame" },
  "vocabulary": {
    "stats": [{ "id": "heat", "name": "Heat", "base": "@con.mod + @prof", "display": true }],
    "counters": [{ "id": "renown", "name": "Renown", "description": "Deeds the world has noticed, awarded by the DM.", "min": 0, "max": "10", "default": 0 }]
  },
  "classes": [
    {
      "id": "ember-knight",
      "name": "Ember Knight",
      "description": "Warriors who burn their own vitality as fuel.",
      "hitDie": 10,
      "saves": ["str", "con"],
      "armorProficiencies": ["light", "medium", "shield"],
      "weaponProficiencies": ["simple", "martial"],
      "skillChoice": { "count": 2, "from": ["athletics", "intimidation", "perception", "survival"] },
      "subclassLevel": 3,
      "columns": [{ "id": "embers", "label": "Embers", "values": [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11] }],
      "levels": [
        {
          "level": 1,
          "features": [
            {
              "id": "embers",
              "name": "Embers",
              "description": "You have a pool of Embers (the class table) that refills on a long rest; a short rest gives back half your level. Flare: as a bonus action, spend any number of Embers to deal 1d6 fire damage per Ember to a creature within 30 feet (Dexterity save halves).",
              "effects": [
                { "do": { "kind": "grantResource", "resource": { "id": "embers", "name": "Embers", "max": "@table.embers", "recharge": "long", "shortRestRegain": "floor(@classLevel / 2)", "display": "pool" } } },
                {
                  "do": {
                    "kind": "grantAction",
                    "action": {
                      "id": "flare",
                      "name": "Flare",
                      "actionType": "bonus",
                      "spend": { "resourceId": "embers", "min": "1", "max": "@table.embers" },
                      "saveDc": "8 + @prof + @con.mod",
                      "saveAbility": "dex",
                      "damage": "(@spent)d6",
                      "damageType": "fire",
                      "range": "30"
                    }
                  }
                }
              ]
            },
            {
              "id": "bloodline",
              "name": "Bloodline",
              "description": "Choose the bloodline that fuels your fire.",
              "effects": [{ "do": { "kind": "grantChoice", "choice": { "id": "pick", "label": "Bloodline", "from": { "kind": "archetypes", "tags": ["ember-bloodline"] } } } }]
            }
          ]
        },
        {
          "level": 2,
          "features": [
            {
              "id": "blazing-stance",
              "name": "Blazing Stance",
              "description": "As a bonus action, spend 1 Ember to wreathe yourself in flame: +1 AC and resistance to cold damage until you end it.",
              "effects": [
                {
                  "do": {
                    "kind": "grantToggle",
                    "toggle": {
                      "id": "blazing-stance",
                      "name": "Blazing Stance",
                      "actionType": "bonus",
                      "cost": { "resourceId": "embers", "amount": "1" },
                      "effects": [
                        { "do": { "kind": "modify", "target": "ac", "op": "add", "value": "1" } },
                        { "do": { "kind": "damageRelation", "damageType": "cold", "relation": "resistance" } }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          "level": 4,
          "features": [
            {
              "id": "asi-4",
              "name": "Ability Score Improvement",
              "description": "Increase your ability scores or take a feat.",
              "effects": [{ "do": { "kind": "grantChoice", "choice": { "id": "feat", "label": "Ability Score Improvement or feat", "from": { "kind": "feats", "categories": ["General"] } } } }]
            }
          ]
        }
      ]
    }
  ],
  "subclasses": [
    {
      "id": "oath-of-cinders",
      "name": "Oath of Cinders",
      "classId": "ember-knight",
      "description": "Knights sworn to burn away corruption.",
      "levels": [
        {
          "level": 3,
          "features": [
            {
              "id": "cinder-strike",
              "name": "Cinder Strike",
              "description": "Your weapon attacks deal an extra 1d4 fire damage.",
              "effects": [{ "do": { "kind": "extraDamage", "damage": "1d4", "damageType": "fire", "appliesTo": { "kinds": ["weapon"] } } }]
            }
          ]
        }
      ]
    }
  ],
  "archetypes": [
    {
      "id": "phoenix-blood",
      "name": "Phoenix Blood",
      "tags": ["ember-bloodline"],
      "levelBasis": "grantingClass",
      "description": "Rebirth runs in your veins.",
      "levels": [
        {
          "level": 1,
          "features": [
            {
              "id": "phoenix-ward",
              "name": "Phoenix Ward",
              "description": "You have resistance to fire damage.",
              "effects": [{ "do": { "kind": "damageRelation", "damageType": "fire", "relation": "resistance" } }]
            }
          ]
        }
      ]
    },
    {
      "id": "salamander-blood",
      "name": "Salamander Blood",
      "tags": ["ember-bloodline"],
      "levelBasis": "grantingClass",
      "description": "You move like spreading fire.",
      "levels": [
        {
          "level": 1,
          "features": [
            {
              "id": "quickfire",
              "name": "Quickfire",
              "description": "Your walking speed increases by 10 feet.",
              "effects": [{ "do": { "kind": "modify", "target": "speed.walk", "op": "add", "value": "10" } }]
            }
          ]
        }
      ]
    }
  ],
  "species": [
    {
      "id": "ashborn",
      "name": "Ashborn",
      "description": "People born in volcanic lands.",
      "size": "Medium",
      "speed": { "walk": "30" },
      "traits": [
        { "id": "darkvision", "name": "Darkvision", "description": "You see in dim light within 60 feet.", "effects": [{ "do": { "kind": "modify", "target": "sense.darkvision", "op": "set", "value": "60" } }] },
        { "id": "ember-skin", "name": "Ember Skin", "description": "You have resistance to fire damage.", "effects": [{ "do": { "kind": "damageRelation", "damageType": "fire", "relation": "resistance" } }] }
      ]
    }
  ],
  "backgrounds": [
    {
      "id": "forge-hand",
      "name": "Forge Hand",
      "description": "You worked the great forges.",
      "features": [
        { "id": "skills", "name": "Skill Proficiencies", "description": "Athletics and Intimidation.", "effects": [{ "do": { "kind": "proficiency", "category": "skill", "value": "athletics" } }, { "do": { "kind": "proficiency", "category": "skill", "value": "intimidation" } }] },
        { "id": "origin-feat", "name": "Origin Feat", "description": "You gain the Savage Attacker feat.", "effects": [{ "do": { "kind": "grantChoice", "choice": { "id": "feat", "label": "Origin feat", "from": { "kind": "feats", "featIds": ["srd-5.2.1:savage-attacker"] } } } }] }
      ]
    }
  ],
  "feats": [
    {
      "id": "kindled",
      "name": "Kindled",
      "category": "General",
      "description": "+1 to an ability of your choice, and your fire spells and attacks deal +2 damage.",
      "effects": [
        { "do": { "kind": "grantChoice", "choice": { "id": "ability", "label": "Ability +1", "from": { "kind": "abilities", "abilities": ["str", "con", "cha"] }, "onPick": [{ "do": { "kind": "modify", "target": "ability.$pick.score", "op": "add", "value": "1" } }] } } },
        { "do": { "kind": "extraDamage", "damage": "2", "damageType": "fire" } }
      ]
    }
  ],
  "spells": [
    {
      "id": "cinder-bolt",
      "name": "Cinder Bolt",
      "level": 0,
      "school": "Evocation",
      "castingTime": "1 action",
      "range": "60 feet",
      "components": "V, S",
      "duration": "Instantaneous",
      "lists": ["ember-knight", "sorcerer", "wizard"],
      "attackType": "ranged",
      "damage": "1d10",
      "damageType": "fire",
      "description": "A mote of burning ash streaks toward a creature. On a hit it takes 1d10 fire damage."
    }
  ],
  "items": [
    {
      "id": "brand-blade",
      "name": "Brand Blade",
      "category": "Weapon",
      "rarity": "Uncommon",
      "description": "A longsword that glows like a coal. +1 to attack and damage rolls.",
      "weapon": { "category": "martial", "range": "melee", "damage": "1d8", "damageType": "slashing", "properties": ["versatile"] },
      "effects": [
        { "do": { "kind": "modify", "target": "attack.bonus", "op": "add", "value": "1", "appliesTo": { "item": { "itemIds": ["brand-blade"] } } } },
        { "do": { "kind": "modify", "target": "attack.damage", "op": "add", "value": "1", "appliesTo": { "item": { "itemIds": ["brand-blade"] } } } }
      ]
    }
  ],
  "monsters": [
    {
      "id": "ash-wolf",
      "name": "Ash Wolf",
      "description": "",
      "size": "Medium",
      "type": "elemental",
      "alignment": "unaligned",
      "ac": "13 (natural armor)",
      "hp": "22 (4d8 + 4)",
      "speed": "40 ft.",
      "str": "12", "dex": "15", "con": "12", "int": "3", "wis": "12", "cha": "6",
      "damage_immunities": "fire",
      "senses": "darkvision 60 ft., passive Perception 13",
      "languages": "—",
      "cr": "1",
      "traits": [{ "name": "Smouldering", "desc": "A creature that touches the wolf takes 2 (1d4) fire damage." }],
      "actions": [{ "name": "Bite", "desc": "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage plus 2 (1d4) fire damage." }]
    }
  ]
}
```
