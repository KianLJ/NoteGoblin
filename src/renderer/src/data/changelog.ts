export interface ChangelogEntry {
  version: string
  title: string
  highlights: string[]
}

/** Newest first. Add a new entry here whenever package.json's version is bumped — VersionBadge/Changelog render straight from this list, so a future release just means a new entry at the top. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.8.0',
    title: 'Read your notes and character sheets on your phone',
    highlights: [
      'New read-only web viewer at relay.notegoblin.uk/viewer — log in with your NoteGoblin name and password from any phone or browser, and add it to your home screen like an app',
      'Your character sheets now sync to your account and show up there in full: hit points, armour class, abilities and saves, skills, attacks, spells and slots, resources, features, equipment and backstory — with every number worked out exactly as the app does, homebrew content included',
      'Campaigns you run are there too: pinned notes, folders, search, links between notes, and dice buttons you can roll right on your phone. DM-only and private notes are labelled',
      'The viewer wears your account’s colours from the desktop app'
    ]
  },
  {
    version: '0.7.2',
    title: 'Fix: adding a vehicle to initiative',
    highlights: [
      'Adding a vehicle to the initiative tracker (Add to initiative, in the Vehicles tab) no longer breaks the app',
      'Loading an encounter from a session scene can no longer add its monsters over and over'
    ]
  },
  {
    version: '0.7.1',
    title: 'Walls, light and sight on the battle map',
    highlights: [
      'Walls, doors and windows: draw whole rooms by dragging, or walls corner by corner. Corners snap to other walls and to the grid, rooms sit flush and share walls, and doors and windows drop straight into a wall. Click a door or window with Move to open or close it',
      'Walls and closed doors stop tokens — they stop at the wall and slide along it, even mid-drag (the DM can hold Alt to drag through). Windows are glass: you can see through them, and climb through once they’re open',
      'Line of sight and lighting: once a map has walls or is dark, players only see what their party can see. Set the map to bright, dim or dark, place lights, and give tokens a torch or lantern; darkvision comes from character sheets. Rooms they’ve explored stay on their map, dimmed',
      'Live play: everyone sees tokens being dragged, light and sight follow them as they move, enemies come into view the moment they’re in sight, and tokens glide to new spots instead of jumping',
      'The map goes on for ever: add as many map images as you like, then move and size them to line up with the grid. A marker shows the map’s centre, with a button to get back to it',
      'A tidier toolbar: tools down the left (with keys — V, R, S, F, W, L, I), each tool’s options along the top, and undo, redo, snapping and map settings in the corner',
      'The Combat tab’s side panel: initiative to type or roll, hit points (temporary hit points first), and a character’s actions and spells from their sheet; monsters’ traits and actions with dice to click. Players get the same for their own character, and can look at the rest of the party’s',
      'Players’ hit points follow their character sheets both ways — the DM’s damage lands on the sheet, and healing on the sheet shows in the fight',
      'Test players: add stand-ins (playing one of your own characters) to try a map out, and use “Play as” to see and move as any player or the whole party'
    ]
  },
  {
    version: '0.7.0',
    title: 'Combat on a battle map, and vehicles of every kind',
    highlights: [
      'A new Combat tab (the crossed swords, top left): a battle map with a token for everyone in the initiative order, sized to match. Move tokens, measure with the ruler, and drop spell areas (cone, sphere, line, cube) sized by dragging, from a square’s corner or centre, with snapping you can turn off',
      'Click anyone on the map to see their hit points, deal damage or heal, add conditions and roll their attacks — monsters straight from their statblocks, players from their character sheets',
      'Fog of war: paint it with a brush, lines, point-by-point shapes, squares or circles, cut holes out of it the same ways, and move or delete any piece of it',
      'Upload a map image and set its grid; Ctrl+Z and Ctrl+Y undo and redo anything on the map; tokens, spell areas and fog can be locked in place; the side panels resize and fold away',
      'Players see the map live when they join: fog is solid for them, anything under it stays secret, and they can move their own token and roll their own attacks',
      'Battles: give each encounter its own map. Enemies go back where you left them every time you load it, and party start spots you set while prepping are where players appear — loading the encounter from a session scene brings its map up too',
      'Hide creatures and spell areas from players and reveal them mid-fight; a hidden creature is missing from their turn order as well',
      'Vehicles: make mounts, carts, ships or starships in the Workshop — hit points, components, crew stations, weapons, fuel and other resources — then track them in a campaign’s new Vehicles tab. Crew fire their station’s weapons, and vehicles can join initiative',
      'Unsaved changes in the Homebrew Workshop are kept when you switch away, until NoteGoblin closes'
    ]
  },
  {
    version: '0.6.11',
    title: 'Homebrew fixes: crits, repeated features and +2/+1',
    highlights: [
      'A lowered critical range now counts when you roll: with Improved Critical or a homebrew feature that crits on 19–20, a 19 on a weapon attack is a critical hit. The Attacks heading shows your range',
      'Workshop: lowering the critical range needs “At most” (At most 19 crits on 19–20) — it now warns if you pick “At least”, which can’t lower it',
      'A homebrew class that repeats a feature at several levels (an Ability Score Increase or Feat at 4, 8, 12…) now gets a separate pick at each level, offered when you level up, instead of the first pick counting twice',
      'Background ability increases stop at +2 on one ability, as the rules say, and a background that offers three abilities shows them as simple − / + boxes',
      'Reminders now sit above Resources on the character sheet'
    ]
  },
  {
    version: '0.6.10',
    title: 'Dice you can click, and a calendar you can jump around',
    highlights: [
      'Calendar: click the month and year above the grid to go straight to any era, year, month and day — Show just looks at it, Make it today moves the campaign there',
      'A new calendar starts in its most recent era instead of year 1',
      'Statblocks roll: write `dice: 1d10` in a monster’s actions or traits (or its hit points) and it becomes a button that rolls in the dice roller — in notes, the Bestiary, the encounter panel and the Workshop',
      'Monsters made with the Workshop’s monster form get rollable hit points and damage automatically',
      'Using an action or an item’s ability now rolls its dice: its attack, then its damage, healing or temporary hit points (set from the actual roll). Actions with damage or healing but no uses get a Use button too'
    ]
  },
  {
    version: '0.6.9',
    title: 'A new character sheet',
    highlights: [
      'The character sheet has a new layout: who you are, hit points, AC, initiative, speed and resources down the left; your six abilities with their saves across the top; skills, passive scores and resistances on the right; and everything else in tabs — Actions, Spells, Features, Inventory, Class and Story',
      'Level up straight from your character card — pick the class if you have more than one, and the button lights up once you have the XP for it. Class levels use − and + buttons instead of a tiny number field',
      'The Class tab is a proper table for every class, homebrew included: features by level (hover one to read it), the class’s own columns and spell slots, with your current level highlighted. Big homebrew tables scroll sideways with the level column kept in view',
      'Spells shows your save DC and spell attack (click to roll) next to your slots, and spell cards are smaller, grouped by level',
      'Features tells you how many choices you still have to make and jumps to the first one',
      'Resources are pips you click to spend, right on the sheet; inventory shows how much you’re carrying as a bar beside your coins',
      'Hover a skill to see where its bonus comes from and its passive score, or an ability to see which improvements and feats raised it. Hover cards only catch the mouse wheel when their text is too long to fit'
    ]
  },
  {
    version: '0.6.8',
    title: 'Homebrew catches up',
    highlights: [
      'Homebrew damage cantrips now show on the Combat tab with their attack or save and dice, scaling at levels 5, 11 and 17 like the SRD’s',
      'Workshop: the weapon mastery effect can be added and edited in the effect editor, and a weapon choice can be limited to melee or ranged weapons, or to ones the character is proficient with'
    ]
  },
  {
    version: '0.6.7',
    title: 'Spells you can roll, Expertise and Weapon Mastery',
    highlights: [
      'Spells on the Spells tab now show their save DC (with the ability) or attack bonus, and their damage or healing — click the dice to roll them',
      'Upcasting: a spell with higher-level slots available gets a level picker next to Cast, which spends that slot and shows the bigger dice (Fireball at 5th level is 10d6)',
      'Cantrips grow at levels 5, 11 and 17 on the Combat tab (Fire Bolt is 2d10 at level 5), and healing spells add your spellcasting modifier',
      'Expertise is a real pick for Rogues (levels 1 and 6), Bards (2 and 9) and Rangers (Deft Explorer, which also asks for two languages, and level 9) — only skills you’re proficient in can be chosen. Skills you’d already marked as Expertise fill those picks for you',
      'Homebrew: new “Expertise in skills of their choice” effect in the Workshop, and a skill choice can be limited to skills the character is already proficient in',
      'Weapon Mastery: Barbarians, Fighters, Paladins, Rangers and Rogues pick the kinds of weapons they’ve mastered (Fighters 3, rising to 6; Barbarians melee weapons, 2 rising to 4), and those weapons’ attacks show their mastery — Sap, Topple, Vex and the rest — with what it does on hover',
      'Every SRD weapon now has its mastery property, and homebrew weapons can have one too (in the guided weapon form, or the full editor); a homebrew class can grant Weapon Mastery with a new Workshop effect'
    ]
  },
  {
    version: '0.6.6',
    title: 'More of the SRD on your sheet',
    highlights: [
      'Class features now change your numbers: Extra Attack, Barbarian Danger Sense, Fast Movement and Feral Instinct, Bard Jack of All Trades, Monk Martial Arts (your Martial Arts die and Dexterity for unarmed strikes and Monk weapons), Disciplined Survivor and Body and Mind, Paladin Aura of Protection and Aura of Courage, Ranger Roving and Feral Senses, and Rogue Slippery Mind',
      'Clerics choose a Divine Order (Protector or Thaumaturge) and Druids a Primal Order (Magician or Warden) on the Features tab',
      'Subclasses: Champion crits on 19 (then 18) with Remarkable Athlete, Draconic Resilience’s HP and AC, Lore’s three bonus skills, Mindless Rage, Aura of Devotion, Second-Story Work, and the Life, Devotion, Draconic and Fiend spell lists, always prepared at the right levels',
      'Species: Dwarven Toughness and Resilience, Gnomish Cunning, Goliath Powerful Build, a Tiefling’s Thaumaturgy and legacy resistance, Dragonborn ancestry (resistance and a Breath Weapon that scales), uses for Breath Weapon, Stonecunning, Adrenaline Rush, Relentless Endurance, Large Form and Draconic Flight, and reminders for Brave, Luck and Resourceful',
      'The Skilled feat asks for its three skills',
      'Keen Senses now asks you to pick Insight, Perception or Survival — in the character creator and on the sheet — and gives you proficiency in it',
      'Fey Ancestry shows as a reminder on your sheet: Advantage on saving throws to avoid or end the Charmed condition',
      'High Elves can swap Prestidigitation for any other Wizard cantrip from its card on the Features tab (as you can after a Long Rest); it starts as Prestidigitation',
      'A Drow’s darkvision is 120 ft. and a Wood Elf’s speed is 35 ft. on the sheet, and every species with Darkvision now shows its range (120 ft. for Dwarves and Orcs)',
      'The character creator shows a species’ other choices (like Keen Senses) right on the species step',
      'SRD magic items now work on your sheet once equipped (and attuned, if they need it) — every magic item now has an Equip button in your inventory',
      'Magic items change your numbers: Ring and Cloak of Protection, +1/+2/+3 armour, Dragon Scale Mail, Bracers of Defense, Belts of Giant Strength, Gauntlets of Ogre Power, Amulet of Health, Headband of Intellect, Ioun Stones, the Luckstone, Robe of the Archmagi, Wand of the War Mage, resistance rings and more — plus swimming, climbing and flying speeds, darkvision, and toggles for Boots of Speed, Wings of Flying and Flame Tongue',
      'Magic weapons add their bonus to the matching weapon you have equipped; a “Weapon, +1” or “any sword” asks which weapon it is right on its inventory card (so does a Ring or Armor of Resistance’s damage type)',
      'Wands, staffs, rings and other charged items track their charges, and a long rest gives back what the item regains at dawn (a wand’s 1d6 + 1) instead of refilling them all',
      'Conditions: add Blinded, Charmed, Frightened, Grappled, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious and the rest from the Conditions card on the Overview tab — they set Advantage or Disadvantage on your attacks, checks, saves and initiative, drop your Speed to 0, and remind you of the rest (like auto-failing Strength and Dexterity saves)'
    ]
  },
  {
    version: '0.6.5',
    title: 'Magic Initiate by spell list, and homebrew choice fixes',
    highlights: [
      'Magic Initiate is now three feats — Magic Initiate (Cleric), (Druid) and (Wizard) — like the 2024 rules and D&D Beyond, each offering only its own list’s cantrips and spell',
      'Acolyte grants Magic Initiate (Cleric) and Sage grants Magic Initiate (Wizard)',
      'You can take Magic Initiate more than once with a different list each time — say Cleric from your background and Wizard from Human Versatile',
      'Existing characters keep every spell they picked: their Magic Initiate becomes the version that matches their background, or the list most of their spells came from',
      'Homebrew: a choice with no abilities (or skills, spells, feats) ticked now offers all of them, as the Workshop says, instead of nothing — so a custom background’s ability score increase can be picked',
      'Homebrew: the character creator’s background step now offers a custom background’s own ability scores',
      'Homebrew: new “Proficiency with a weapon of their choice” effect in the Workshop — the player picks a weapon (any, or just simple or martial) and attacks with it get their proficiency bonus'
    ]
  },
  {
    version: '0.6.4',
    title: 'Attunement',
    highlights: [
      'Items that need attunement now have an Attune button in your inventory, next to Equip — a homebrew item that needs attunement works (its bonuses, charges and reminders) once it’s both equipped and attuned',
      'Your inventory shows how many items you’re attuned to, out of the usual 3, and warns if you go over'
    ]
  },
  {
    version: '0.6.3',
    title: 'See what the updater is doing, and a new look for updates',
    highlights: [
      'The “update ready” pop-up is now a NoteGoblin card in the corner instead of a plain Windows box — Restart now, or Later',
      'The installer has a fresh look with the NoteGoblin logo and colours',
      'When an update is found, a small pill next to the version number shows it downloading and how far along it is — updates download in the background, so before this it looked like nothing was happening',
      'Once it’s downloaded, the pill becomes “Restart to update”, so you can install it whenever suits you, even after choosing Later',
      'Click the version number for a Check for updates button and the updater’s status, and if a check fails it now says why (like “No internet connection”) instead of failing silently'
    ]
  },
  {
    version: '0.6.2',
    title: 'A smaller download and homebrew item fixes',
    highlights: [
      'The app is about half the size to download: the soundtrack is stored more efficiently (you won’t hear a difference), and unused language files are no longer included. This update downloads the music once more; later updates are small again',
      'The Homebrew Workshop and the Codex load the first time you open them, so the app starts a little faster',
      'An item’s charges only show on your sheet while the item is in use — equipped, attuned if it needs attunement, or always for items that work just by being carried — and each charged item keeps its own count, named after the item',
      'Homebrew weapons and item charges now show the item’s description when you hover over them'
    ]
  },
  {
    version: '0.6.1',
    title: 'Make something: homebrew without the jargon',
    highlights: [
      'The Homebrew Workshop now opens on "What do you want to make?" — pick a magic item, weapon, armour or shield, spell, feat, species or monster and fill in a form worded like a D&D book: rarity, "+1 to attack and damage", resistances, darkvision, charges, damage dice and more, with the character sheet maths worked out for you',
      'A live preview shows it as it will appear in the Codex, and "Try it on a character" shows exactly what it changes on a sheet of any class and level — "Armor Class 12 → 13", a new attack, a spell\'s damage at each slot level',
      'Monsters: set the challenge, ability scores and hit dice, and attacks, saving throws, hit points, initiative and passive Perception are written into the statblock for you. Statblocks now have bonus actions, lair actions and an initiative line too — the initiative tracker rolls with it',
      'New things go in your My Homebrew pack, or pick another pack with "Save to". Things you\'ve made are listed by pack and type, and each can be reopened, deleted, or opened in the full editor for anything the form doesn\'t cover',
      'The full editor uses plainer words (Contents, New rules terms, Rename things, Pick lists), and its Contents list folds by section so big packs stay manageable'
    ]
  },
  {
    version: '0.6.0',
    title: 'Homebrew: content packs and the Homebrew Workshop',
    highlights: [
      'New Homebrew Workshop — the hammer button next to DM and Player mode — for making your own content packs: classes, subclasses, species, backgrounds, feats, spells, items, creatures and more, with forms for everything, a level-table grid for classes, and a starter shortcut for whatever you want to make first',
      'Effects are added by saying what they should do ("a bonus to a number", "a pool of points", "+1 to an ability of their choice"…), formulas show what they work out to and read back in plain English, problems are explained in plain words with a Fix button where there\'s an obvious fix, and a test character beside the editor highlights what each change does',
      'Simple mode keeps the Workshop uncluttered; tick Advanced for every option and the JSON views. A short tour walks you through it the first time',
      'Content packs: import and export .ngpack.json files, and the DM enables packs per campaign from the new Content Packs button — players get them automatically, even offline. The DM pushes updates and chooses which pack wins when two rename the same thing',
      'Homebrew works across the character sheet: pack classes, species and backgrounds in the creator and level-ups, pack skills, stats and counters on the Overview, actions where you choose how many points to spend, temporary points, short-rest recovery, toggles, companions and summons with their own HP and attacks, damage reduction, pack conditions and currencies, and renamed terms (like "Spell Slots" or an ability) throughout',
      'The Codex has a Homebrew section for everything in your packs, pack spells and items can be added from the Spells and Inventory tabs, and creatures can live in packs — "Save to Bestiary" now saves into your own My Creatures pack, and creatures saved on this device can be moved into it',
      'Choices are simpler: each card shows what you picked and a Choose / Change button, and the full list opens in its own window with search and each option\'s description. Ability score increases are a single row of six +/− buttons',
      'New Damage and Heal buttons on the hit point box — damage comes off temporary HP first — and levelling down now lowers your HP too',
      'A Randomize button for ability scores in the character creator, and icons throughout the app instead of emoji',
      'Fixed a feat that can only be taken once (like Magic Initiate) being picked twice — once from a background and again from Human Versatile'
    ]
  },
  {
    version: '0.5.16',
    title: 'Simpler choices and level-ups',
    highlights: [
      'Every choice on the character sheet — Ability Score Improvements and feats, Fighting Styles, Metamagic, Eldritch Invocations, subclass options, spell picks, species traits — now uses one consistent card on the Features tab and in the level-up popup, ready for homebrew content in upcoming updates',
      'No more Choose/Apply buttons: picking from a list is the choice, and you can change a single pick right from its dropdown',
      'Ability Score Improvements are now two quick steps: pick "Ability Score Improvement" (or a feat) for the slot, then pick your two +1s — the same ability twice gives +2',
      'Circle Spells and lineage spells (like a Tiefling\'s Fire Bolt) are added automatically instead of behind a grant button, and show up on the Spells tab, in Actions and under Reactions',
      'Each feat now shows on the choice that picked it, instead of in a separate Feats section',
      'Fixed the level-up popup briefly showing "nothing new" before your new features appeared',
      'The Skills column is narrower, giving the Combat area more room'
    ]
  },
  {
    version: '0.5.15',
    title: 'A new rules engine under the character sheet',
    highlights: [
      'Every number on the character sheet — abilities, saves, skills, AC, initiative, speed, HP, attacks, spell DC and slots, class resources — now comes from a new rules engine that will power homebrew content (custom classes, feats, spells and items) in upcoming updates',
      'Archery now adds +2 to ranged weapon attacks automatically, and Alert adds your proficiency bonus to Initiative (including in the Initiative Tracker) — both used to be notes you had to apply by hand',
      'Weapon proficiency now follows your class: a weapon you aren\'t proficient with shows a "Not proficient" tag and no longer adds your proficiency bonus to the attack roll',
      'Resistances, immunities and vulnerabilities granted by a feature, item or active buff now show on the sheet automatically, not just Rage\'s',
      'Rolls the DM forces now apply exhaustion\'s disadvantage, matching the sheet'
    ]
  },
  {
    version: '0.5.14',
    title: '0.5.13 bug fix',
    highlights: [
      'Fixed a shared relay account still failing to reconnect its real campaign data ("an existing row already uses this id under a different name") in the specific case where this device already held two local copies of the account under different names — the two are now merged into one instead of the login being blocked'
    ]
  },
  {
    version: '0.5.13',
    title: 'Cross-device login and appearance-sync fixes',
    highlights: [
      'Fixed logging into a shared relay account sometimes failing to reconnect its real campaign data ("an existing row already uses this id under a different name") when the locally-typed display name didn\'t exactly match how it was stored — it\'s now correctly recognized as the same account and reconnected instead of blocked',
      'Fixed a device that had already customized its own appearance silently overwriting a different account\'s saved theme/colors with its own the moment that account logged in for the first time with nothing saved yet — appearance sync is now tracked per local identity instead of one shared bucket per device'
    ]
  },
  {
    version: '0.5.12',
    title: 'Dismemberment, a redesigned combatant card, and app-wide fade animations',
    highlights: [
      'New optional Dismemberment system for the Initiative Tracker (per-encounter toggle in the gear menu) — a hit dealing 1/4 max HP offers small losable parts (hands, fingers, eyes, ears), 1/2 max HP offers whole limbs, and a killing blow dealing full max HP in one hit offers beheading or bisection; rolling now chases a highlight across the options before landing on one instead of just appearing instantly',
      'Connected players now join the Initiative Tracker automatically the moment they connect — the "+ Add Players" button is gone',
      'Redesigned the Initiative Tracker\'s combatant card — initiative and AC sit as icon+value columns beside the name, HP got its own bigger heart-shaped column, and the "PC"/"Monster" tag is gone (redundant with the card\'s own layout)',
      'Cards, menus, popovers, and tags now fade in when they appear and fade out when dismissed, instead of just snapping in and out of existence, across the whole app',
      'Fixed hover tooltips (spell/item/monster cards) sometimes rendering below the cursor for a frame before snapping to their correct position above it',
      'Fixed a shared relay account occasionally failing to log in on a device that had previously been used to test a different account, with a raw database error instead of a real explanation — that leftover state is now cleared automatically'
    ]
  },
  {
    version: '0.5.11',
    title: '0.5.10 bug fix',
    highlights: [
      'Fixed a shared relay account getting permanently stuck as "not connected" once its local password fell out of sync (e.g. after a password change from another device) — logging back in with the account\'s current password now reconnects it instead of failing forever'
    ]
  },
  {
    version: '0.5.10',
    title: 'Full dice icon set and a redesigned initiative tracker',
    highlights: [
      'Every die shape (d4, d6, d8, d10, d12, d20) now has its own icon, and the roll popup automatically shows the correct one for whatever\'s actually being rolled — a check still shows a d20, but a 2d6 damage roll shows a d6, a d6+1d8 shows a d8, and so on — instead of always showing a d20 regardless of the roll',
      'Fixed the roll popup briefly flashing a d20 before switching to the correct die shape on a damage roll — it now shows the right die from the very first frame',
      'Fixed the roll popup\'s d20 losing the wireframe lines around its front face',
      'Initiative Tracker: status effects now add through a single "+ Status" button that opens the full list, instead of a row of always-visible quick-toggle chips',
      'Initiative Tracker: initiative, HP, and AC are now shown inside dice/heart/shield icons on each combatant\'s card instead of plain labeled fields, and HP damage/heal now opens a small amount field next to the − and + buttons instead of a separate typed-amount box'
    ]
  },
  {
    version: '0.5.9',
    title: 'Every spell and monster makes noise, plus a smarter encounter builder',
    highlights: [
      'Every spell now has a Cast button — cantrips included — that plays a one-shot cue picked automatically by what the spell actually does; all 321 SRD spells are covered',
      'Clicking a monster or spell in the Codex now plays its sound too, and a monster\'s own cue plays automatically (broadcast to the table) the moment its turn comes up in the Initiative Tracker; the Creatures cue set was expanded from 9 to 21 so aberrations, fiends, celestials, constructs, and more each get their own voice instead of one generic growl',
      'New "+ Add custom SFX" option on a Spell or Monster\'s Codex page — pick your own audio file to override its auto-picked cue (local to your own device)',
      'Combat & Turn Flow cues (Initiative Start, Turn Change, Death Saves, End Combat) are no longer a manual Sound Board menu — they now play automatically off the Initiative Tracker\'s own actions',
      'New "Playing the Game" tab in the Codex — the full SRD ability check/combat/movement/resting rules, plus a Conditions & Status Effects reference (Stunned, Blinded, Prone, Cover, and the rest), browsable by DM and players at any time',
      'Goblin Bard\'s Ambient layers now react to the active campaign\'s own calendar — rain and wind levels rise and fall automatically (scaling with intensity, not just on/off) to match today\'s weather, only while a mood is already selected and playing',
      'The Initiative Tracker\'s Build Encounter panel now has one-click Easy/Medium/Hard/Deadly buttons that generate a mixed-species encounter sized to the actual party (or a manually entered hypothetical one), plus a monster search dropdown with mouse-following statblock previews',
      'Sound Board cues now get a small random pitch variation on every play, and are capped at 10 seconds with a fade-out instead of running long uncut',
      'Fixed a dis/adv roll\'s result sound sometimes playing a second time when dismissing the popup, and ambient wind/rain levels not updating when the campaign\'s current day changed'
    ]
  },
  {
    version: '0.5.8',
    title: 'Sound Board curation, ability cues, and roll color fixes',
    highlights: [
      'Curated five Sound Board categories with real audio — Weapon Impacts, Elemental & Damage, Spellcasting, Class Features, and Creatures & Combat — each cue randomly picking from several takes so a repeated sound never plays identically twice, plus a small random pitch variation on every play',
      'Activating a class feature on the character sheet (Rage, Divine Smite, Channel Divinity, Flurry of Blows, Metamagic, Arcane Recovery, and more) now plays and broadcasts that ability\'s Sound Board cue to the whole table — including from a joined player\'s own client, not just the DM\'s',
      'A natural 20 on an attack roll now plays a Critical Hit cue, and a natural 1 plays a random Miss/Whiff cue, both broadcast table-wide',
      'Fixed the roll popup\'s color (and its result sound\'s pitch) being based on the raw die face instead of the final total — a bad roll saved by a big modifier now reads as the decent-or-better result it actually was, and a damage roll now grades against its own die\'s range (a d6 grades 1-6, not against a d20\'s 1-20) instead of looking artificially bad next to a scale it was never rolled on'
    ]
  },
  {
    version: '0.5.7',
    title: 'Sound Board, synced ambiance, and note-embedded audio',
    highlights: [
      'New Sound Board toolbar button — a searchable, categorized menu of one-shot combat/magic/creature cues (weapon impacts, elemental damage, spellcasting, spell schools, class features, creatures, footsteps, turn flow), each triggering to every connected player when broadcasting is on',
      'A cue with multiple curated takes (e.g. several different sword-clang recordings) now picks one at random each time it plays, so a repeated cue never sounds identical twice in a row',
      'Goblin Bard\'s Ambient layers (wind, rain, crowd, etc.) now actually reach connected players instead of only ever playing on the DM\'s own device — they sync the same way music does',
      'Notes now support typing `OneShot: ` or `Statblock: ` inline for an autocomplete popup — picking a Sound Board cue inserts a clickable play button right in the note, picking a monster inserts its full stat block, both without leaving the keyboard',
      'Bundled audio (music, ambiance, dice/UI sounds) moved out of the app\'s compressed archive so future updates only re-download what actually changed instead of the whole audio library every time'
    ]
  },
  {
    version: '0.5.6',
    title: 'Interactive advantage/disadvantage rolls and dice reveal overhaul',
    highlights: [
      'Rolling with advantage/disadvantage now shows two dice you click independently, in either order, instead of both being rolled for you at once — the dropped die visibly flies away once both have landed',
      'A roll now reveals its raw die result first, then a "+5"/"−2" modifier chip flies in and the number updates to the real total, instead of the modifier being silently baked into the very first number shown; a natural 20 or 1 skips this and stays on the dramatic raw roll',
      'The die now colors itself by how good the raw roll was — red near a 1, grey around 10, green climbing to a natural 20, with a distinct purple for a "dirty 20" (hit 20 only via the modifier, not an actual natural 20)',
      'Dice-roll and crit/fumble sounds now play exactly when the result actually appears on screen instead of the instant a roll resolves internally, sometimes well before the animation caught up; added new whoosh (modifier impact) and result (ordinary reveal, pitched to the roll\'s quality) sound effects',
      'Fixed several stuck-forever bugs in the roll popup, a note-onto-note drag ejecting it to the wrong folder, spells not showing in the character sheet\'s spell picker despite being grantable via Magic Initiate, and a background-granted feat being unrecoverable once removed',
      'A spell\'s Action/Bonus Action/Reaction badge is now derived automatically from its casting time instead of a manual dropdown, and known spells are grouped by level in the Spells tab'
    ]
  },
  {
    version: '0.5.5',
    title: 'Character creation overhaul — SRD 5.2.1 species, classes, and backgrounds',
    highlights: [
      'Species, classes, and backgrounds now match the 2024 SRD 5.2.1 rules instead of 2014 — new species list (Goliath and Orc replace Half-Elf/Half-Orc), every class picks its subclass at level 3, and backgrounds grant an ability score increase plus a real Origin feat instead of a flavor-text feature',
      'Elf, Gnome, and Tiefling species grant a lineage/legacy choice with real cantrips and (for Elf/Tiefling) spells that unlock at character level 3 and 5',
      'Origin feats (Magic Initiate, Alert, Savage Attacker, etc.) and a background\'s ability score increase are now real, visible entries on the character sheet — previously they silently did nothing or showed as a stray note instead of an actual bonus/feat',
      'The character sheet\'s Race field is now a dropdown that actually drives Speed and Racial Traits, and prompts you to finish Human\'s or a lineage species\' choices if you switch to one',
      'Character creation wizard reorganized: name, alignment, and appearance now live together on the first step (each with a random-fill button), the final step is a full character summary instead of a couple of lines, and every extra choice (lineage, Origin feat, ability increase) has its own clearly separated section',
      'Warlock\'s Eldritch Invocations, Sorcerer\'s Metamagic, and per-level class features rewritten to match the 2024 rules (Pact Boon folded into Invocations, Paladin\'s Smite, etc.)'
    ]
  },
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
