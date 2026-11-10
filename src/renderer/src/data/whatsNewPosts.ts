import canvasShot from '../assets/whatsnew/0.10.0/canvas.jpg'
import menuShot from '../assets/whatsnew/0.10.0/menu.jpg'
import statblockShot from '../assets/whatsnew/0.10.0/statblock.png'
import sessionsShot from '../assets/whatsnew/0.10.0/sessions.jpg'
import editorShot from '../assets/whatsnew/0.10.0/editor.jpg'
import cuesShot from '../assets/whatsnew/0.11.1/cues.jpg'
import encountersShot from '../assets/whatsnew/0.11.1/encounters.jpg'
import woundsShot from '../assets/whatsnew/0.11.1/wounds.png'
import hiddenShot from '../assets/whatsnew/0.11.2/hidden.png'

export interface WhatsNewSection {
  heading: string
  body: string
  /** A screenshot (an imported asset). */
  image?: string
  caption?: string
}

/**
 * A version's "What's new" written up as a short post — an intro, then a
 * section per feature with a screenshot. Shown in the What's New box (see
 * features/shell/WhatsNew.tsx) for that version instead of its changelog
 * bullet points. A version without a post just shows its bullets.
 */
export interface WhatsNewPost {
  version: string
  title: string
  intro: string
  sections: WhatsNewSection[]
}

/** Newest first. Each version's post shows once you're running that version (it needs a CHANGELOG entry too). */
export const WHATS_NEW_POSTS: WhatsNewPost[] = [
  {
    version: '0.11.3',
    title: 'Notes on the calendar, and a round of fixes',
    intro: 'A small update: players can read what an event is about on the day it happens, and a batch of things that were getting in the way are fixed.',
    sections: [
      {
        heading: 'Read today’s event notes',
        body: 'When an event on the calendar’s current day is paired with a note, players see a Read note tag on it. Clicking it opens the note to read, even a DM-only one, since pairing it puts it in front of the table. Hidden parts stay hidden, and on other days the note stays closed.'
      },
      {
        heading: 'Presenting and sounds',
        body: 'When you start presenting, players who don’t have the Sessions box out get it opened for them. Looking up a monster or a spell in the Codex now only plays its sound for you, not the whole table; casting a spell from a character sheet still plays for everyone.'
      },
      {
        heading: 'Fixes',
        body: 'Deleted campaigns stay deleted instead of coming back. The DM can write in the party chat again, and a friend’s message notification no longer disappears straight away. A pinned box can’t be dragged off the top of the canvas any more, and any that were stuck there come back into reach.'
      }
    ]
  },
  {
    version: '0.11.2',
    title: 'Secrets in any note',
    intro: 'Hidden text now works everywhere, and you choose who gets to read it. Plus a few fixes to presenting and the turn order.',
    sections: [
      {
        heading: 'Hide part of any note',
        body: 'Select some lines, right-click and choose Hide from other players. Only you and the DM can read them now, in any note, not just session scenes. To let someone in, right-click inside the hidden part and tick them under Who else can see it, or pick them straight away with Hide, but let one player see it. Hidden parts show as a tinted box that says who else sees it, and Unhide puts the text back for everyone. If someone who can’t see a hidden part edits the note, the hidden part is kept.',
        image: hiddenShot,
        caption: 'Two hidden parts: one for nobody else, one Ann can also read, with the right-click menu open.'
      },
      {
        heading: 'Presenting fixed',
        body: 'Pressing Present brings up your presenting controls again, whether or not the Players box is open. Players now see a session only once you present it, and only the scenes you’ve shown them.'
      },
      {
        heading: 'The turn order, your way',
        body: 'Players now see the enemies in their real turn order. If you’d rather keep enemies’ initiative a mystery, turn on Random enemy order for players in the initiative tracker’s settings. Players can also see every combatant’s wounds on their Combat screen, enemies and allies alike.'
      }
    ]
  },
  {
    version: '0.11.1',
    title: 'Busier scenes, and an encounter library',
    intro: 'A smaller update, mostly from your feedback: scenes can hold more, encounters have a home of their own, and a handful of things that weren’t working now are.',
    sections: [
      {
        heading: 'Scenes with several fights and songs',
        body: 'A scene can now have as many encounters and as much music as you like, each added from the top of its note. The first song plays when the scene comes up. While you present, every encounter and song for that scene sits on the bar at the top of the screen: one click loads a fight or plays a song for the table. New scene boxes also open bigger, so there’s room to write under the cues.',
        image: cuesShot,
        caption: 'A scene with two encounters and two songs, and the same cues on the presenter bar above it.'
      },
      {
        heading: 'An encounter library of its own',
        body: 'Saved encounters now live in the Encounter Library, a tool of its own on the canvas and a tab beside Selected in the Combat screen. Search or filter by tag, then open an encounter to load its enemies, save where they stand on the map, make it the encounter for the map that’s up, edit it in the builder or delete it. Saved positions come back whenever a scene loads the encounter.',
        image: encountersShot,
        caption: 'The Encounter Library in Combat: an encounter opened, with its enemies’ positions saved.'
      },
      {
        heading: 'Wounds that match the tracker',
        body: 'With dismemberment on, a big enough hit brings up a wound under that combatant: minor, major or a killing blow, tinted by how bad it is. Pick the body part or roll for it, or skip it. Wounds show as red tags on the combatant, for you and the players.',
        image: woundsShot,
        caption: 'A major wound waiting for a body part, and a goblin already short an ear.'
      },
      {
        heading: 'Fixes',
        body: 'Your own songs and sound effects now play for everyone at the table, and choosing a profile picture works in the installed app. Clicking or selecting text in a note lands where the mouse is at any canvas zoom. The music box’s volume and crossfade sliders stay inside the box, and the battle map’s snap button now says “Snap on” or “Snap off”.'
      }
    ]
  },
  {
    version: '0.11.0',
    title: 'A fresh coat of paint, and a face for everyone',
    intro: 'This update goes back over the menus and tools that had fallen behind the canvas, so the whole app feels like one thing. Here’s what changed.',
    sections: [
      {
        heading: 'Your account, and your face',
        body: 'Your name in the corner is now a round account button, top left beside the mode switch. Click it for light or dark, Settings and signing out. Settings is now a proper window with a page for each thing. On the Profile page, click the circle to choose a profile picture: it shows on your account button, in your friends’ lists, in messages and on the party’s faces at the table.'
      },
      {
        heading: 'Colours that make sense',
        body: 'Choosing colours is down to two picks: an accent for buttons and highlights, and a background tone for everything else. Each swatch shows exactly what you’ll get, the choice applies to light and dark, and contrast stays as readable as the default. Dark mode’s borders, text fields and sliders are easier to tell apart too. (If you picked a background tone before, pick it again to get the improved version.)'
      },
      {
        heading: 'Music and sounds, your own included',
        body: 'The music player and sound board have been rebuilt. Drag your own songs and sound effects in and everyone at the table hears them. Right-click anything to rename it, make your own moods and sound categories, or add sounds to the built-in ones. Minimise the music box and it becomes a small player; each tool now has its own minimised view.'
      },
      {
        heading: 'Redesigned tools',
        body: 'The initiative tracker and encounter builder are cleaner, and adding an enemy is a quick search instead of a huge list. The calendar and its builder are easier to follow, with a simpler time of day and ready-made calendars to start from. The Codex, Friends, Content Packs and Messages all match the rest of the app now.'
      },
      {
        heading: 'And a few fixes',
        body: 'Text on the canvas stays sharp at any zoom. The battle map opens on its centre point and new tokens line up level with it. Making a session no longer drops you into its collection, and :: hidden text is hidden from players again.'
      }
    ]
  },
  {
    version: '0.10.0',
    title: 'A table you lay out yourself',
    intro:
      'The sidebars and tabs are gone. Everything — your notes, the initiative tracker, statblocks, the calendar, music — is now a box on one big canvas you can arrange however your table runs. Here’s the tour. (Prefer the old screens? Settings → Appearance → Classic layout brings them back.)',
    sections: [
      {
        heading: 'Everything is a box on the canvas',
        body: 'Drag boxes by their title bar, resize them from any edge, minimize them to a small tile, or pin one so it stays put while you pan and zoom. Scroll to zoom, and drag with the right or middle mouse button to pan. Your arrangement is saved, and you can save it as a named layout to come back to.',
        image: canvasShot,
        caption: 'A DM’s canvas mid-session: a note, a rollable statblock, sticky notes, the session timer and two collections.'
      },
      {
        heading: 'Right-click to add anything',
        body: 'Right-click empty canvas and pick Add to put something new exactly there: a note, a monster’s statblock, a sticky note, an image, a collection or a session. Below that you can open a player’s sheet, or any tool that isn’t open yet, on the same spot. Players get their own menu with their notes, characters and the party’s sheets.',
        image: menuShot,
        caption: 'The right-click menu — everything opens where you clicked.'
      },
      {
        heading: 'Statblocks you can roll from',
        body: 'Add a monster from the Codex (or the right-click menu) and its statblock becomes a box you can roll from: ability checks, saves, skills, attacks and damage are all buttons. Rolls stay on your side of the screen — the players never see the monster’s numbers.',
        image: statblockShot,
        caption: 'Every bonus and damage roll is a button: the solid part is what gets rolled.'
      },
      {
        heading: 'Sessions, all in one place',
        body: 'Each session is a collection of its own: open it and its scenes are note boxes, numbered and joined by arrows in the order they’ll play. Drag a scene somewhere else and the order follows — left to right, then down. Give a scene an encounter and a music mood from the tiles at the top of its note. Press Present and a small control pins itself to the screen to step through it with the table, bringing each scene into view. Players only ever see the scenes you’ve presented, and their Sessions box simply shows the scene you’re on — nothing pops open on their screen. Close a session’s tile and it’s tucked away, still a click away in the Sessions box.',
        image: sessionsShot,
        caption: 'A session’s collection: its scenes numbered in order, the live one glowing, and the Sessions box listing every session.'
      },
      {
        heading: 'Edit any monster',
        body: 'Every creature in the Codex, and every statblock on the canvas, has an Edit button. Each field is laid out beside the live statblock, and under each action you can see exactly which roll buttons its text will give you. “Write an attack” fills in an attack in the form the statblock rolls. SRD and pack monsters are saved as your own copy in My Creatures.',
        image: editorShot,
        caption: 'The monster editor: the roll buttons each action gets are shown right under it.'
      },
      {
        heading: 'And a little more',
        body: 'Sticky notes for quick reminders that aren’t campaign notes. Collections to tuck a group of boxes into one tile you can open like its own canvas. A session timer in the dock, now with a stopwatch. Images and homebrew Codex entries straight onto the canvas. An encounter builder with monster cards, a difficulty meter and a tagged library, and enemy positions you can save into an encounter so they’re back on the same squares when a scene loads it. Hover cards now sit beside what they explain instead of on top of it, and spells show their details as you hover them in Add Spell. The canvas now looks like parchment, and its edges take on the colour of whatever music is playing.'
      }
    ]
  }
]
