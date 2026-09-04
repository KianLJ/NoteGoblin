/**
 * The SRD 5.2.1 "Playing the Game" chapter — the core d20 Test / combat /
 * exploration rules every table actually needs to look up mid-session
 * (what does Dodge do, exactly, how do death saves work, what's the DC for
 * climbing in the rain) — browsable in the Codex the same way Monsters,
 * Spells, Equipment, and Magic Items already are (see Bestiary.tsx). Split
 * into topics rather than one long scroll so a specific rule is a click
 * away, not a search-and-scroll. Reference content, not campaign content —
 * lives here as static data rather than in any campaign's own notes.
 */
export interface RuleSection {
  /** Omit for a topic's opening paragraphs before its first named subsection. */
  heading?: string
  /** One or more paragraphs; a string starting with "- " renders as a bullet in its own list instead of a paragraph. */
  body: string[]
}

export interface RuleTopic {
  id: string
  title: string
  dek: string
  sections: RuleSection[]
}

export const PLAYING_THE_GAME_TOPICS: RuleTopic[] = [
  {
    id: 'ability-checks',
    title: 'Ability Checks',
    dek: 'The d20 Test that everything else in this chapter builds on.',
    sections: [
      {
        body: [
          'Whenever the outcome of an action is uncertain, roll a d20, add relevant modifiers, and compare the total to a target number. This is a D20 Test, and it comes in three flavors: the ability check, the saving throw, and the attack roll.',
          'An ability check tests a creature’s innate talent and training in a broad area of activity, such as forcing open a stuck door or seeing through a disguise. The DM decides which of the six abilities is relevant to a given check and sets the Difficulty Class (DC) — the number the total must equal or exceed to succeed.'
        ]
      },
      {
        heading: 'Typical Difficulty Classes',
        body: [
          '- Very easy — DC 5',
          '- Easy — DC 10',
          '- Medium — DC 15',
          '- Hard — DC 20',
          '- Very hard — DC 25',
          '- Nearly impossible — DC 30'
        ]
      },
      {
        heading: 'Contests',
        body: [
          'Sometimes a check is opposed by another creature’s check — a contest. Both sides roll a d20 and add modifiers; whoever rolls higher wins. On a tie, the situation stays the same as it was before the contest (a creature trying to push past a guard fails to get by if the contest ties).'
        ]
      },
      {
        heading: 'Working Together',
        body: [
          'When two or more characters team up on a task, the one who’s more skilled leads and makes the check with advantage, as long as at least one helper could actually contribute meaningfully and the task is one that can actually be split up or aided.'
        ]
      },
      {
        heading: 'Group Checks',
        body: [
          'When several characters try the same thing at once (sneaking past a guard, swimming a rushing river), everyone able to attempt it makes the check; if at least half the group succeeds, the whole group succeeds.'
        ]
      }
    ]
  },
  {
    id: 'advantage-disadvantage',
    title: 'Advantage & Disadvantage',
    dek: 'Circumstances that swing a d20 Test one way or the other.',
    sections: [
      {
        body: [
          'Sometimes an ability, feature, spell, or circumstance says a roll is made with advantage or disadvantage. When that happens, roll a second d20 alongside the first.',
          'With advantage, use the higher of the two rolls. With disadvantage, use the lower. Roll the second d20 only once per roll, even if multiple sources grant advantage or disadvantage at the same time — having several advantages doesn’t stack, and neither does having several disadvantages.',
          'If a roll is granted both advantage and disadvantage at once, they cancel out, and a single d20 is rolled with no advantage or disadvantage, regardless of how many sources of each are present.'
        ]
      }
    ]
  },
  {
    id: 'proficiency',
    title: 'Proficiency',
    dek: 'Represents a character’s training in a skill, tool, save, or weapon.',
    sections: [
      {
        body: [
          'A character’s proficiency bonus is added to a D20 Test whenever they’re proficient in whatever’s being tested — a skill, a saving throw, a weapon or tool, and so on. It also applies to the attack rolls of any weapon or spell a character is proficient with. The bonus never applies more than once to a single roll, even if multiple things would normally add it.'
        ]
      },
      {
        heading: 'Proficiency Bonus by Level',
        body: [
          '- Levels 1–4 — +2',
          '- Levels 5–8 — +3',
          '- Levels 9–12 — +4',
          '- Levels 13–16 — +5',
          '- Levels 17–20 — +6'
        ]
      }
    ]
  },
  {
    id: 'actions-in-combat',
    title: 'Actions in Combat',
    dek: 'What a Multiattack of options actually does, one at a time.',
    sections: [
      {
        heading: 'Attack',
        body: ['The most common action in combat — make one attack roll (or more, with a feature that grants extra attacks).']
      },
      {
        heading: 'Cast a Spell',
        body: ['Casting a spell with a casting time of an action, bonus action, or reaction uses that action; longer casting times use the spellcasting rules in the Spells chapter instead.']
      },
      { heading: 'Dash', body: ['Gain extra movement for the current turn equal to your Speed, after applying any modifiers.'] },
      {
        heading: 'Disengage',
        body: ['Your movement doesn’t provoke opportunity attacks for the rest of the turn.']
      },
      { heading: 'Dodge', body: ['Until the start of your next turn, any attack roll against you has disadvantage if you can see the attacker, and you make Dexterity saving throws with advantage. You lose this benefit if you’re incapacitated or your speed drops to 0.'] },
      {
        heading: 'Help',
        body: [
          'Help another creature’s ability check by lending aid, or help an ally’s attack roll by distracting the target — the creature you help gains advantage on the next check or attack roll it makes before the start of your next turn, as long as the aid actually makes sense for the task.'
        ]
      },
      {
        heading: 'Hide',
        body: ['Make a Dexterity (Stealth) check in an attempt to hide, following the rules for hiding.']
      },
      { heading: 'Influence', body: ['Use the social interaction rules to try to change a creature’s attitude via talking, gestures, or a similar method.'] },
      {
        heading: 'Ready',
        body: [
          'Choose a trigger and an action (or movement) you’ll take in response to it, then act on your reaction the moment that trigger occurs, before the end of your next turn. Readying a spell requires concentrating on it until the trigger occurs.'
        ]
      },
      { heading: 'Search', body: ['Make a Wisdom (Perception) or Intelligence (Investigation) check to find something.'] },
      { heading: 'Study', body: ['Make an Intelligence check to recall lore, drawing on relevant proficiency (History, Arcana, Nature, and so on) if you have it.'] },
      { heading: 'Utilize', body: ['Use an object — pull a lever, light a torch, uncork a potion — that requires more than the free interaction every turn already allows.'] }
    ]
  },
  {
    id: 'making-an-attack',
    title: 'Making an Attack',
    dek: 'Attack rolls, opportunity attacks, and cover.',
    sections: [
      {
        heading: 'Attack Rolls',
        body: [
          'Roll a d20 and add the relevant modifiers (ability modifier + proficiency bonus, if proficient). If the total equals or beats the target’s Armor Class, the attack hits.',
          'A roll of 20 on the d20 is always a critical hit — the attack hits regardless of modifiers or AC, and its damage dice are rolled twice and added together. A roll of 1 is always a miss, regardless of modifiers.'
        ]
      },
      {
        heading: 'Melee and Ranged Attacks',
        body: [
          'A melee attack targets a creature within your reach, usually 5 feet. A ranged attack lets you engage a target at a distance, within the weapon or spell’s range; attacking a target within 5 feet of a hostile creature that can see you imposes disadvantage on a ranged attack roll.'
        ]
      },
      {
        heading: 'Unarmed Strike',
        body: ['A punch, kick, or similar attack — deals bludgeoning damage equal to 1 + your Strength modifier on a hit.']
      },
      {
        heading: 'Opportunity Attacks',
        body: [
          'You can make one reaction attack when a hostile creature you can see moves out of your reach, unless that creature took the Disengage action first or its movement was somehow forced (a shove, a spell) rather than voluntary.'
        ]
      },
      {
        heading: 'Two-Weapon Fighting',
        body: [
          'When you take the Attack action and attack with a light melee weapon in one hand, you can use a bonus action to attack with a different light melee weapon in the other hand, so long as you haven’t already used a bonus action this turn. You don’t add your ability modifier to the second attack’s damage unless that modifier is negative.'
        ]
      },
      {
        heading: 'Cover',
        body: [
          'An obstacle between attacker and target can grant cover. Half cover (low wall, furniture, a creature) gives a +2 bonus to AC and Dexterity saves; three-quarters cover (a portcullis, an arrow slit) gives +5; total cover blocks a target from being targeted directly.'
        ]
      }
    ]
  },
  {
    id: 'conditions',
    title: 'Conditions & Status Effects',
    dek: 'Stunned, blinded, prone, and everything else a spell or attack can inflict.',
    sections: [
      {
        body: [
          'A condition alters a creature’s capabilities in a variety of ways — a spell, a trap, or an environmental hazard can impose one for a set duration or until some trigger removes it. Some conditions (Prone, Restrained) are common battlefield outcomes; others (Petrified, Paralyzed) are rarer and far more severe. Multiple instances of the same condition don’t stack — a creature is simply affected by it, or not.'
        ]
      },
      { heading: 'Blinded', body: ['Can’t see, and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and its own attack rolls have disadvantage.'] },
      { heading: 'Charmed', body: ['Can’t attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature.'] },
      { heading: 'Deafened', body: ['Can’t hear, and automatically fails any ability check that requires hearing.'] },
      { heading: 'Frightened', body: ['Has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight, and can’t willingly move closer to that source.'] },
      { heading: 'Grappled', body: ['Speed becomes 0, and any bonus to speed doesn’t apply. Ends if the grappler is incapacitated, or if an effect removes the grappled creature from the grappler’s reach (a Large or larger creature being pulled away, for instance).'] },
      { heading: 'Incapacitated', body: ['Can’t take actions, bonus actions, or reactions. Any ongoing concentration is unaffected unless the source of the incapacitation says otherwise.'] },
      { heading: 'Invisible', body: ['Impossible to see without the aid of magic or a special sense, and heavily obscured for the purpose of hiding. The creature’s location can be detected by any noise it makes or tracks it leaves. Attack rolls against it have disadvantage, and its own attack rolls have advantage.'] },
      { heading: 'Paralyzed', body: ['Incapacitated, and can’t move or speak. Automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage, and any attack that hits from within 5 feet is a critical hit.'] },
      { heading: 'Petrified', body: ['Transformed, along with any nonmagical objects it’s wearing or carrying, into a solid inanimate substance (usually stone). Incapacitated, can’t move or speak, and is unaware of its surroundings. Attack rolls against it have advantage. Automatically fails Strength and Dexterity saving throws. Resistant to all damage, and immune to poison and disease (though an existing poison or disease is merely suspended, not cured).'] },
      { heading: 'Poisoned', body: ['Has disadvantage on attack rolls and ability checks.'] },
      { heading: 'Prone', body: ['The only movement option is to crawl, unless it stands up and thereby ends the condition. Has disadvantage on attack rolls. An attack roll against the creature has advantage if the attacker is within 5 feet of it, and disadvantage otherwise.'] },
      { heading: 'Restrained', body: ['Speed becomes 0, and any bonus to speed doesn’t apply. Attack rolls against the creature have advantage, and its own attack rolls have disadvantage. Has disadvantage on Dexterity saving throws.'] },
      { heading: 'Stunned', body: ['Incapacitated, can’t move, and can speak only falteringly. Automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage.'] },
      { heading: 'Unconscious', body: ['Incapacitated, can’t move or speak, and is unaware of its surroundings. Drops whatever it’s holding and falls prone. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.'] },
      {
        heading: 'Exhaustion',
        body: ['A cumulative track from level 0 to 10, each level imposing a −2 penalty to every d20 Test and reducing Speed by 5 feet — see Resting & Downtime for how it’s gained and removed.']
      },
      {
        heading: 'Concentration',
        body: [
          'Some spells require concentration to sustain their effect — a creature can concentrate on only one such spell at a time, and starting a new one ends any other. Concentration breaks if the creature is incapacitated or dies, and can be broken by taking damage: make a Constitution saving throw with a DC equal to 10 or half the damage taken, whichever is higher.'
        ]
      },
      {
        heading: 'Cover (quick reference)',
        body: [
          'Not a condition, but affects a creature the same way one might — an obstacle between attacker and target. Half cover grants +2 to AC and Dexterity saves; three-quarters cover grants +5; total cover can’t be targeted directly at all. See Making an Attack for the full rule.'
        ]
      }
    ]
  },
  {
    id: 'damage-and-healing',
    title: 'Damage & Healing',
    dek: 'Hit points, dying, and getting back up.',
    sections: [
      {
        body: [
          'Hit points represent a combination of physical and mental durability, the will to live, and luck. Damage rolls (usually a die or dice plus a modifier) are subtracted from current hit points; when hit points reach 0, excess damage carries over and can cause instant death (see below).'
        ]
      },
      {
        heading: 'Dropping to 0 Hit Points',
        body: [
          'A creature that drops to 0 hit points either dies outright or falls unconscious.',
          'Instant death: if damage reduces you to 0 hit points and there’s damage remaining, you die if the remaining damage equals or exceeds your hit point maximum.',
          'Falling unconscious: if you’re reduced to 0 hit points and don’t die outright, you fall unconscious. This unconsciousness ends if you regain any hit points.'
        ]
      },
      {
        heading: 'Death Saving Throws',
        body: [
          'When you start your turn at 0 hit points, roll a d20 (no modifiers): 10 or higher is a success, 9 or lower is a failure. On a natural 20, you regain 1 hit point instead. On a natural 1, it counts as two failures.',
          'Three successes stabilizes you (you remain unconscious). Three failures, and you die. Successes and failures don’t need to be consecutive — track both until you hit 3 of one kind, then reset.',
          'Taking any damage while at 0 hit points causes one automatic death save failure (two if the hit is a critical hit); an amount of damage equal to or exceeding your hit point maximum in a single hit kills you outright.'
        ]
      },
      {
        heading: 'Stabilizing & Healing',
        body: [
          'A creature can stabilize a dying character with a DC 10 Wisdom (Medicine) check or by administering any healing. A stable creature stops making death saves but stays unconscious until it regains at least 1 hit point.',
          'Healing restores hit points, up to the creature’s hit point maximum; any excess is lost, it doesn’t carry over. Temporary hit points are a buffer on top of your real hit points — damage reduces them first, they don’t stack with each other (a new set replaces the old rather than adding to it), and they can’t be healed.'
        ]
      }
    ]
  },
  {
    id: 'movement-and-environment',
    title: 'Movement & the Environment',
    dek: 'Getting around, and the world pushing back.',
    sections: [
      {
        heading: 'Speed & Difficult Terrain',
        body: [
          'Your Speed is how far you can move in one turn under normal conditions. Every foot of movement in difficult terrain (rubble, thick undergrowth, deep snow) costs an extra foot.'
        ]
      },
      {
        heading: 'Climbing, Swimming & Crawling',
        body: [
          'Climbing, swimming, or crawling costs 1 extra foot of movement for every foot moved, unless you have a climbing or swimming Speed. The DM may call for a Strength (Athletics) check to climb a slippery or crumbling surface, or to swim rough water.'
        ]
      },
      {
        heading: 'Jumping',
        body: [
          'A long jump (with a 10-foot running start) covers a number of feet up to your Strength score; without a running start, that’s halved. A high jump (with a running start) clears 3 + your Strength modifier feet, halved without a running start.'
        ]
      },
      {
        heading: 'Falling',
        body: ['A fall deals 1d6 bludgeoning damage per 10 feet fallen, to a maximum of 20d6, and the creature lands prone (unless it avoids taking any damage from the fall).']
      },
      {
        heading: 'Suffocating',
        body: [
          'A creature can hold its breath for a number of minutes equal to 1 + its Constitution modifier (minimum 30 seconds). When that runs out, it can survive a number of rounds equal to its Constitution modifier (minimum 1) before dropping to 0 hit points and starting to suffocate.'
        ]
      },
      {
        heading: 'Vision & Light',
        body: [
          'Bright light lets most creatures see normally. Dim light (moonlight, a shadowy corner) creates a lightly obscured area — Perception checks that rely on sight there take disadvantage. Darkness creates a heavily obscured area — a creature there is effectively blinded.',
          'Darkvision lets a creature see in dim light as if it were bright light, and in darkness as if it were dim light, but only in shades of gray.'
        ]
      },
      {
        heading: 'Food & Water',
        body: [
          'A character needs one pound of food and one gallon of water per day (half a gallon in extreme heat). Going without food, a character can survive a number of days equal to 3 + their Constitution modifier before starting to suffer exhaustion; going without water, they start suffering exhaustion after just 24 hours.'
        ]
      }
    ]
  },
  {
    id: 'time-and-special-combat',
    title: 'Time, Mounted & Underwater Combat',
    dek: 'How a round actually plays out, on foot, on horseback, or underwater.',
    sections: [
      {
        heading: 'Rounds & Turns',
        body: [
          'Combat unfolds in rounds, each representing about 6 seconds. Every creature involved takes one turn per round, in initiative order; on your turn you can move up to your Speed and take one action, plus a bonus action and reaction if something grants you one.'
        ]
      },
      {
        heading: 'Mounted Combat',
        body: [
          'A willing creature at least one size larger than you, with an appropriate anatomy, can be mounted as a bonus action (or dismounted the same way). While mounted, you can control the mount if it’s trained for riding, and it moves on your turn using your movement (though it can still act independently on its own if uncontrolled). If your mount is knocked prone or forced to move against its will, you may need to make a Dexterity save to avoid being dismounted.'
        ]
      },
      {
        heading: 'Underwater Combat',
        body: [
          'Underwater, a creature without a swimming Speed that isn’t magically adapted has disadvantage on melee attack rolls (unless the weapon is a dagger, javelin, shortsword, spear, or trident) and ranged weapon attacks automatically miss beyond their normal range (short range for those that don’t use one), except for crossbows, nets, and thrown weapons. Fire-based damage is also impossible to deal underwater.'
        ]
      }
    ]
  },
  {
    id: 'social-interaction',
    title: 'Social Interaction',
    dek: 'Talking your way through instead of rolling initiative.',
    sections: [
      {
        body: [
          'Social interaction usually plays out as roleplaying, supported by ability checks when the outcome is uncertain — a Charisma (Persuasion) check to win someone over honestly, Deception to lie convincingly, or Intimidation to coerce through threats.',
          'An NPC’s attitude toward the party — friendly, indifferent, or hostile — shapes how willing they are to help, and can shift over the course of a conversation based on how it goes.'
        ]
      }
    ]
  },
  {
    id: 'resting',
    title: 'Resting & Downtime',
    dek: 'Short rests, long rests, and what happens between adventures.',
    sections: [
      {
        heading: 'Short Rest',
        body: [
          'A period of downtime, at least 1 hour long, during which a character does nothing more strenuous than eating, drinking, reading, or tending to wounds. A character can spend one or more Hit Dice at the end of a short rest, rolling each one and adding their Constitution modifier, to regain that many hit points.'
        ]
      },
      {
        heading: 'Long Rest',
        body: [
          'A period of extended downtime, at least 8 hours long, including at least 6 hours of sleep and no more than 2 hours of light activity. At the end of it, a character regains all lost hit points and up to half their total Hit Dice (minimum 1). A character can’t benefit from more than one long rest in a 24-hour period, and needs at least 1 hit point at the start of the rest to gain its benefits.',
          'Exhaustion (see below) decreases by 1 level after a long rest, provided the character also had food and drink.'
        ]
      },
      {
        heading: 'Exhaustion',
        body: [
          'Exhaustion is tracked in levels, from 0 to 10. Each level imposes a cumulative −2 penalty to every d20 Test rolled, and reduces the character’s Speed by 5 feet per level. A character who reaches exhaustion level 10 dies.'
        ]
      },
      {
        heading: 'Between Adventures',
        body: [
          'Between sessions of active adventuring, characters can spend downtime on activities like crafting, practicing a trade, researching, training, or simply recuperating — usually resolved with a montage of checks over however many days the DM allots, rather than played out scene by scene.'
        ]
      }
    ]
  }
]

export function findRuleTopic(id: string): RuleTopic | undefined {
  return PLAYING_THE_GAME_TOPICS.find((t) => t.id === id)
}
