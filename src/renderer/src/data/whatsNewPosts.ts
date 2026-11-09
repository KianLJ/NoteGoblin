import canvasShot from '../assets/whatsnew/0.10.0/canvas.jpg'
import menuShot from '../assets/whatsnew/0.10.0/menu.jpg'
import statblockShot from '../assets/whatsnew/0.10.0/statblock.png'
import sessionsShot from '../assets/whatsnew/0.10.0/sessions.jpg'
import editorShot from '../assets/whatsnew/0.10.0/editor.jpg'

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
