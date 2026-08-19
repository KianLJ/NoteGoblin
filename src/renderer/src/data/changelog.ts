export interface ChangelogEntry {
  version: string
  title: string
  highlights: string[]
}

/** Newest first. Add a new entry here whenever package.json's version is bumped — VersionBadge/Changelog render straight from this list, so a future release just means a new entry at the top. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.4',
    title: 'Campaign chat',
    highlights: [
      'Added live chat, available to the DM and every player regardless of hosting — a resizable strip along the bottom of the right-side panel',
      'Party chat reaches the whole table, DM included',
      'Whispers let a player message the DM privately, and the DM message any individual player privately',
      'Chat history is saved per campaign and reloads when you reopen the panel'
    ]
  },
  {
    version: '0.3.3',
    title: 'Show your character in Discord presence',
    highlights: [
      'Player-side Discord presence now shows "Playing in <campaign> as <character>" when you have a character selected, falling back to just "Playing in <campaign>" otherwise'
    ]
  },
  {
    version: '0.3.2',
    title: 'Fix Discord Rich Presence never actually showing',
    highlights: [
      "Fixed Rich Presence never appearing — it was connecting to Discord successfully but never completing the handshake step that actually marks the connection ready to send a status"
    ]
  },
  {
    version: '0.3.1',
    title: 'Discord Rich Presence',
    highlights: [
      'Added Discord Rich Presence — your status shows "DM for <campaign>" while hosting, or "Playing in <campaign>" while connected to someone else\'s',
      'Shows a bit of goblin flavor the rest of the time instead of nothing',
      'Entirely best-effort: works only if Discord\'s desktop client is running, and never affects the app if it isn\'t'
    ]
  },
  {
    version: '0.3.0',
    title: 'Dice Tray',
    highlights: [
      'Added a shared Dice Tray — labeled buttons roll any number of any standard die (d4–d100) plus a modifier, available to the DM and every player',
      'Every roll appears in a live log shared by the whole table, showing who rolled, the formula, the total, and the full per-die breakdown',
      'Added a private-roll option — everyone else sees that you rolled, but the actual result stays visible only to you',
      'Notes now support inline dice rolls — write `dice: 2d6 + 3` as inline code and it becomes a clickable roll button, in both the live-preview editor and Preview, logged to the same shared tray',
      'All tabs in the DM and player header strips (including the new enemy statblock tabs) can now be dragged into any order, not just notes',
      'Widened the Initiative tracker’s HP/AC fields so larger numbers no longer get clipped',
      'The Party/Dice/Initiative panel is now available to players immediately, instead of only after joining a campaign'
    ]
  },
  {
    version: '0.2.9',
    title: 'Enemy tabs, statblock spacing, and more class feature fixes',
    highlights: [
      'Statblocks in notes no longer render with huge phantom gaps between every line, and are capped to a sensible width',
      'Clicking an enemy in the Initiative tracker opens its statblock in its own tab, so the DM can have several open at once',
      'Favored Enemy and Natural Explorer no longer show up for non-Ranger classes leveling up',
      'Magic Initiate now actually auto-enables spellcasting when taken from the level-up popup, not just from the Features tab',
      "Barbarian's Primal Champion now raises Strength and Constitution to 24",
      'Bard Magical Secrets is a real chooser — learn 2 spells from any class at your castable level, free of your normal cap',
      'Cleric Turn Undead and Monk Flurry of Blows/Patient Defense/Step of the Wind are now usable actions, and Divine Smite also appears on the Actions tab',
      "Fixed Channel Divinity options (Sacred Weapon, Turn the Unholy, Preserve Life) being hidden behind an incorrect either/or choice",
      'Favored Enemy: Humanoids now lets you name the two specific races',
      'Natural Explorer shows its full benefit text for every terrain, not just Arctic',
      "Fixed the level-up popup showing nothing for Ranger archetype features (Hunter's entire kit is choice-based, and the popup had no chooser for that shape at all)"
    ]
  },
  {
    version: '0.2.8',
    title: 'Reactions, actions restructure, and class feature fixes',
    highlights: [
      'Reactions granted by a subclass (not just the base class) now show up on the Reactions tab',
      'Added a Reckless Attack toggle, and broadened the Attacks list to include save-based damaging cantrips (Acid Splash, Poison Spray)',
      'Magic Initiate is now a real chooser — pick your spellcasting ability plus cantrips/spell from the Cleric/Druid/Wizard list, auto-enabling spellcasting if needed',
      "The Spells tab's \"+ Add Spell\" picker now restricts to your own class's spell list",
      'Wild Shape now states its actual beast restrictions per level and becomes unlimited at 20th level',
      'Circle of the Land now actually grants its circle spells once your terrain and level qualify',
      "Added the Champion's Additional Fighting Style pick at 10th level",
      "Monk's Unarmored Movement now increases speed, and Barbarian/Monk Unarmored Defense now affects AC",
      'Added real Ranger Favored Enemy and Natural Explorer choosers, in Features and the level-up popup',
      'Sneak Attack now shows its actual scaling dice and a fuller description',
      'Renamed the Attacks tab to Actions, adding Bonus Actions and Class Resources sections alongside it'
    ]
  },
  {
    version: '0.2.7',
    title: 'Added this changelog',
    highlights: [
      'The version number in the bottom-right corner is now clickable and opens a "What\'s new" changelog',
      'Backfilled the changelog with every release back to 0.1.0'
    ]
  },
  {
    version: '0.2.6',
    title: 'Codex import in notes, character join prompt, and UI polish',
    highlights: [
      'Restored the "Import from Codex" statblock picker in the note toolbar, with larger toolbar icons',
      'Renamed the Bestiary launcher to Codex',
      'Joining a session with multiple characters now prompts you to pick one',
      'The bottom-left character switcher no longer reverts to "Add character" when viewing a note',
      'Swapped the Constitution ability icon for the Charisma heart shape',
      'Removed the stray dash placeholder on empty Resistances/Vulnerabilities/Immunities rows'
    ]
  },
  {
    version: '0.2.5',
    title: 'SRD Codex, level-up detail, reactions, and warlock/wizard choosers',
    highlights: [
      'Expanded the Bestiary into a full Codex — Monsters, Equipment, Spells, and Magic Items with real search and filters',
      'Rebuilt the level-up popup to separate every reward into its own section, including subclass features',
      'Added a Reactions tab (known reaction spells plus SRD class features that spend one)',
      'Damage-dealing cantrips now list as attacks in the Combat panel',
      'Added real SRD Eldritch Invocations, Mystic Arcanum, and Wizard Spell Mastery/Signature Spells choosers',
      'Fixed Font of Inspiration recharge, missing ASI slots on combined class-table rows, stale ability scores in the ASI chooser, unlimited cantrip adding, and rest buttons not resetting class resources'
    ]
  },
  {
    version: '0.2.4',
    title: 'Initiative tracker, encounter builder, and bestiary integration',
    highlights: [
      'Added a live-synced initiative tracker with auto-populated players and a play mode',
      'Added a player-facing initiative view showing injury bands instead of exact monster stats',
      'Added an encounter builder with SRD difficulty math and saved encounters',
      'Notes can import a statblock from the Bestiary or save a rendered one back to it',
      "Fixed Obsidian's ![[image]] embed syntax not rendering",
      'Fixed folder expand/collapse state not persisting across restarts',
      'Added a back button for offline campaign snapshots'
    ]
  },
  {
    version: '0.2.3',
    title: 'Fix "DM hasn\'t started a session" for vault-mode campaigns',
    highlights: [
      "Fixed vault-mode (local file storage) campaigns failing to mark themselves active, which blocked every player join",
      'Migrated existing host databases in place to apply the fix'
    ]
  },
  {
    version: '0.2.2',
    title: 'Surface silent active-campaign sync failures',
    highlights: [
      'Active-campaign sync failures are now logged instead of failing silently',
      'Added temporary diagnostics to trace a live join issue between DM and players'
    ]
  },
  {
    version: '0.2.1',
    title: 'Attacks, AC, advantage tracking, and notes-editor fix',
    highlights: [
      'Correct attack ability rules (ranged/thrown/finesse/melee) with distinct to-hit/damage display',
      'Working Rage-style resource activation and fixed AC calculation',
      'Feat-driven speed/initiative bonuses and resistances/vulnerabilities tracking',
      'Extended the advantage/disadvantage system across checks, saves, and attacks',
      'Fixed a CodeMirror crash that had broken markdown rendering (tables, statblocks) in the notes editor',
      'Reworked the right panel for players'
    ]
  },
  {
    version: '0.2.0',
    title: 'Major character sheet overhaul',
    highlights: [
      'Automatic class/subclass features, ASI, Fighting Style, feats, and racial traits shown as hoverable cards',
      'Added a level-up popup as a shortcut for the same choices',
      'Divine Smite is now a real resource with a cast button that spends a spell slot',
      "Equipping a weapon or armor now drives Combat's Attacks list and AC automatically",
      'Added a weight tracker and auto-granted starting gear on character creation',
      'Armor Stealth disadvantage and Strength-requirement speed penalties now apply automatically',
      'Class Table now shows full 1-20 progression',
      'Added offline campaign snapshots — a previously joined campaign stays browsable (read-only) when the DM isn\'t hosting',
      'Added the Bestiary, an SRD-5.1 monster browser',
      'Added SRD-based subclass features and feats data, wired into character creation and level-up',
      'Statblocks and tables now render live while writing, not just in preview'
    ]
  },
  {
    version: '0.1.6',
    title: 'Statblocks, word count, fonts, and real image files in the vault',
    highlights: [
      'Added statblock rendering — a ```statblock code block renders as a formatted D&D card in note previews',
      'Added a word count display on the note editor (current note and campaign total)',
      'DM can now rename or delete a campaign from the switcher',
      'Added font selection to Appearance settings',
      'Vault-stored campaigns can now reference real image files on disk, not just pasted images',
      'Fixed multi-select delete, wikilink navigation reusing the current tab, and open tabs not persisting across restarts'
    ]
  },
  {
    version: '0.1.5',
    title: 'Private-note fixes and DM folder authority',
    highlights: [
      'Fixed a database constraint that blocked players from creating private notes',
      'DM can now move and delete folders, not just notes',
      'Re-inviting a player who left no longer gets stuck on "Invited"',
      'Folder delete now uses an in-app confirmation instead of a native browser dialog',
      'Admin panel: inline account editing (display name, password reset)'
    ]
  },
  {
    version: '0.1.4',
    title: 'Private notes, drag-and-drop images, and local vault storage',
    highlights: [
      'Added a third note visibility tier: Private (author-only, not even the DM can see it)',
      'Notes now support dragging an image file straight onto the editor',
      'Added opt-in local file storage for campaigns, Obsidian-style — notes live as real files on disk',
      "Fixed the DM's move/delete permissions, live character-sheet viewing, and importing notes authored outside the app",
      'Fixed a settings popover z-index bug and character sheet edits dropped by the autosave debounce'
    ]
  },
  {
    version: '0.1.3',
    title: 'Live character sheet sync and real read-only enforcement',
    highlights: [
      "Fixed the DM's character sheet viewer freezing at a snapshot instead of updating live",
      'Read-only notes are now properly enforced at the editor level, not just visually',
      "DM can now edit any shared note's content in their own campaign",
      'Version badge moved to the bottom-right corner'
    ]
  },
  {
    version: '0.1.2',
    title: 'Show the app version',
    highlights: ['Added the running app version as a small corner label, to confirm updates actually applied']
  },
  {
    version: '0.1.1',
    title: 'Fix the relay connection never recovering',
    highlights: [
      'Fixed the relay WebSocket never reconnecting after a drop (wifi blip, sleep/wake) — added auto-reconnect and an idle keepalive ping',
      'GitHub releases now publish directly instead of as drafts, so the auto-updater can actually see them'
    ]
  },
  {
    version: '0.1.0',
    title: 'First release',
    highlights: [
      'Notes with an Obsidian-style markdown live editor, wikilinks, and image pasting',
      'DM console and character creator/character sheets',
      'Migrated from LAN hosting to an internet-based Friends menu with a relay server — live sync, presence, and session hosting from anywhere',
      'Custom window chrome, multiple test accounts, DM-controlled active campaign',
      'Relay account admin panel and sign-out flow',
      'Auto-update via GitHub Releases, and DM/Player mode locking while a session is active'
    ]
  }
]
