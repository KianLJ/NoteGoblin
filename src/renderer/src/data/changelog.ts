export interface ChangelogEntry {
  version: string
  title: string
  highlights: string[]
}

/** Newest first. Add a new entry here whenever package.json's version is bumped — VersionBadge/Changelog render straight from this list, so a future release just means a new entry at the top. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.4',
    title: 'Goblin Bard sync fixes',
    highlights: [
      'Fixed switching moods/tracks again before the previous crossfade finished sometimes leaving an old track stuck playing forever, immune to pause and the volume slider',
      'Fixed stale music from a previous session (or your own earlier solo tinkering) sometimes still playing after joining or leaving a session',
      'The volume slider now syncs to connected players, not just your own device',
      'Turning off "Broadcast to players" now stops players immediately instead of only affecting future picks',
      "Fixed custom tracks never actually reaching players — the relay's connection caps a single message's size, which was silently dropping a custom track's audio; it's now sent in smaller pieces and reassembled on their end"
    ]
  },
  {
    version: '0.5.3',
    title: 'Goblin Bard — synced music and sound effects',
    highlights: [
      'New Goblin Bard music system: pick a mood from a bundled library of tracks, played on loop with a configurable crossfade, optionally broadcast (with pause/resume/skip) to every connected player',
      'Right-click a mood to play one of its tracks specifically, or add/remove your own custom local tracks per mood — custom tracks broadcast to players too',
      'Session scenes can link a mood (and optionally a specific track) right in the scene note itself, alongside the existing Encounter link — auto-plays when that scene goes live',
      'Added curated sound effects for hosting, joining, disconnecting, dice rolls, resting, and messages'
    ]
  },
  {
    version: '0.5.2',
    title: 'Live session presentations, pinned notes, custom NPCs, and reliability fixes',
    highlights: [
      'New Sessions tab: build a scene-by-scene session deck (each scene is a real note with the full editor), present it live so connected players see the same scene the DM is on, and let players browse past sessions afterward',
      'Scenes support a `::` block syntax for DM-only asides — hidden from players even while presenting — and can link a saved Initiative Tracker encounter for one-click loading mid-scene',
      'Session decks now cache offline too, so players can browse past sessions even when the DM isn\'t currently hosting',
      'Pinned notes — right-click any note to pin it to the top of its section',
      'New NPCs section in the Codex: build reusable NPC statblocks with a portrait, and generate a race-flavored name procedurally instead of picking from a fixed list',
      'Added a React error boundary — a single component crashing no longer blanks the whole window',
      'Added a toast when a connected player disconnects mid-session',
      'Various fixes to note permissions and autosave behavior for read-only viewers'
    ]
  },
  {
    version: '0.5.1',
    title: 'Calendar bug fixes, initiative fairness, exhaustion, and character portraits',
    highlights: [
      'Fixed the calendar being unusable while hosting a session, and edits failing with "not connected to that session"',
      'Fixed a crash (blank window) from setting a calendar month to an extreme length, both when creating and when it happens to already be stored',
      'Fixed a crash when dragging a note folder between Party/DM/Private visibility',
      'Fixed the unread message/notification counter not clearing after opening a conversation',
      'Initiative tracker now keeps a player\'s max HP and AC in sync with their character sheet automatically',
      'Players can no longer infer monster initiative order or see exact monster initiative rolls when initiative is hidden — monster order is now shuffled per view',
      'Added an exhaustion tracker (0-6, with SRD effects) to the character sheet',
      'Added a portrait slot to the character sheet'
    ]
  },
  {
    version: '0.5.0',
    title: 'A full in-world campaign calendar',
    highlights: [
      'New Calendar tab in the DM/player side panel — a DM-built calendar with custom weekdays, months, leap days, and eras, viewable day/week/month, with a click-through day detail panel below',
      'Seasons with their own climate (temperature, rain chance, cloudiness, wind range, sunrise/sunset) — weather for any day is generated deterministically from a per-calendar seed, so the same day always has the same weather without rolling and storing it',
      'Locations can override a season\'s climate for specific months, and weather/cloudiness/rain are described in plain weather-report language ("grey, overcast", "heavy downpour") instead of raw numbers',
      'Moons with deterministic 8-phase cycles, and each season\'s sunrise/sunset drives a simple day/night indicator for the current time',
      'Full event system — one-time or repeating (yearly/monthly/weekly) events with categories, colors shown as dots on the calendar, and the option to pair an event with an existing campaign note',
      'Players get a read-only view of the same calendar — browse freely, but only the DM can edit dates, weather, or events',
      'The DM/player right-side panel now remembers which tab you had open (Players/Party, Initiative, Dice, Calendar) across mode switches and app restarts',
      'Added the ability to remove a previously-joined campaign\'s cached offline data from the player tab',
      'Backend hardening: a malformed or older-shaped stored calendar now degrades gracefully (defaults, or a blank calendar as a last resort) instead of ever crashing the window'
    ]
  },
  {
    version: '0.4.3',
    title: 'Fixed a long-standing scroll stutter across the whole app',
    highlights: [
      'Fixed a background performance bug — present since the Dice Tray was added — that made scrolling stutter everywhere (most noticeably in the Codex, notes, and character sheets), and that never went away once it started',
      'Root cause: a bug in how the DM header\'s tab strip merged note and monster tabs meant it was quietly re-rendering the entire app, over and over, forever, from the moment a campaign was opened',
      'Font/UI scaling now uses a real CSS transform instead of the browser\'s zoom, fixing a separate issue where scrolling would visibly pause and "snap" at non-default font sizes'
    ]
  },
  {
    version: '0.4.2',
    title: 'Fixed the corner menu and header becoming unreachable at larger font sizes',
    highlights: [
      'Fixed the bottom-left corner menu (and the top header) rendering past the edge of the window — and becoming unclickable — whenever font size was increased above the default, or a note was tall enough to need scrolling',
      'Root cause: the font-size setting scales the app via the browser\'s zoom, which inflates anything sized off the real window height unless it\'s explicitly compensated for — now it is, everywhere that matters (the main window, the login screen, the Codex, and modals)'
    ]
  },
  {
    version: '0.4.1',
    title: 'Messages redesign, session controls moved, and polish',
    highlights: [
      'Messages moved out of the side panels into a small button in the header, next to Friends — new messages now pop out of it for a few seconds instead of living in a persistent panel',
      'Start/Stop Hosting moved from the Friends menu into the Campaign Selector, and Leave Session into the Character Selector — both now need a second click to confirm',
      'The Messages panel remembers which tab (and which friend thread) you last had open',
      'Dice rolls now show the character who rolled instead of your account name, and the Dice tab\'s pop-up notification shows the type of dice rolled',
      'You now show up in your own Party tab, not just everyone else',
      'Fixed a "critical success" banner showing up alongside a DC failure — a natural 20 doesn\'t auto-succeed a check or save against a DC in 5e, only attack rolls',
      'A DM-forced roll\'s DC can no longer be set below 0',
      'Players connected to a campaign can no longer see monster stat blocks in the Codex (or import one into a note) — everything else in the Codex still works',
      'The app now enforces a single running instance — launching it again just refocuses the existing window',
      'The login screen now shows NoteGoblin\'s actual logo instead of a placeholder icon',
      'Various dice roll popup polish: slower, smoother tumble and reveal, no more jerky stop, and the Inspiration label sits above its icon instead of below'
    ]
  },
  {
    version: '0.4.0',
    title: 'Character sheet dice rolls, forced rolls, and a dramatic reveal',
    highlights: [
      'Ability checks, saving throws, skill checks, and attack/damage rolls on the character sheet now actually roll — click the bonus to open a dramatic roll popup, click the die to roll it, logged in the Dice Tray like any other roll',
      'Right-click a check/save/skill/attack roll button to roll with Advantage or Disadvantage instead of the default',
      'A Baldur’s Gate 3-style full-screen reveal for those rolls — random numbers flicker and brighten as the die spins, then visibly tip over from the closest flickered number to the real result, with crit/fumble callouts and a DC pass/fail badge',
      'DMs can right-click a connected player in the Players tab to force a roll — pick the check/save/skill and an optional DC, and the player gets a can’t-dismiss prompt with their own modifier already applied',
      'Right-click a die in the Dice Tray to remove one from the pool instead of only being able to add',
      'The right side panel (Dice/Players/Initiative) is now always visible for the DM, even before any campaign is open',
      'Fixed a felt input delay when scrolling anywhere in the app'
    ]
  },
  {
    version: '0.3.7',
    title: 'Fixed party chat failing with a FOREIGN KEY error in vault mode',
    highlights: [
      'Fixed "FOREIGN KEY constraint failed" when sending a party chat message with local vault file storage enabled',
      'The same underlying bug could also have hit characters and initiative in vault mode — fixed there too'
    ]
  },
  {
    version: '0.3.6',
    title: 'Messages panel polish and layout fixes',
    highlights: [
      'Fixed party chat failing with "Not connected to that session" while the DM was hosting',
      'Removed the Whispers panel — Friends already covers DM<->player messaging without the extra tab',
      'Added a Leave Session button for players, instead of only being able to wait for the DM to disconnect you',
      'Moved the version badge out of the corner it shared with the chat composer, into the header',
      'Moved notification toasts to the top-right so they stop covering the Messages panel',
      "Panel widths and the Messages split now actually save — they'd previously reset every time you switched between DM/player mode or restarted the app"
    ]
  },
  {
    version: '0.3.5',
    title: 'Friend DMs, cross-campaign whispers, and message notifications',
    highlights: [
      'Renamed the chat panel to Messages and split it into Party, Friends, and Whispers',
      'Friends: message any relay friend privately, anytime, independent of any campaign',
      "Whispers: your DM<->player history now spans every campaign you've shared with that person, each thread tagged with which campaign it came from",
      'New messages now feed the existing notification system — toast popups and the bell, same as friend requests',
      'Added unread counters on the Party/Friends/Whispers tabs, plus a "new" marker next to whichever friend or whisper thread has something unread'
    ]
  },
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
