/**
 * A DM-authored, scene-by-scene session deck — presented live (see
 * sessionHost.ts's broadcastSceneChanged) so connected players see the same
 * scene the DM is on as they click through it, and can browse any deck
 * (live or past) read-only afterward, the same way the offline campaign
 * snapshot already works for notes.
 */
/**
 * A scene is a real Note (see shared/ipc.ts) — this is just its ordering
 * slot and encounter link within a deck. Title/body/editing all go through
 * the exact same Note infrastructure (NoteEditor, notes:update, wikilinks,
 * autosave) a normal note does; a note is marked as a scene via its
 * `sceneDeckId` field, which is also what tells campaignService to strip
 * `::`-prefixed DM-only lines out of `bodyMarkdown` for non-DM readers on
 * every normal note read path, not just the session-deck one.
 */
export interface SessionScene {
  noteId: string
  /** A saved encounter's id (see src/renderer/src/data/savedEncounters.ts) the DM can load into the Initiative Tracker with one click while presenting this scene — null if this scene has no combat. Purely a reference; the encounter's actual monster roster stays in the DM's local savedEncounters store, never duplicated here. */
  encounterId: string | null
  /** A Goblin Bard mood group id (see src/renderer/src/data/musicLibrary.ts) — presenting this scene picks a random track from it, same as clicking the mood in MusicButton.tsx. Null if this scene has no music cue. */
  moodId: string | null
  /** A specific track id within `moodId` (bundled or one of the DM's own custom additions) — presenting this scene plays exactly this track instead of a random pick from the mood. Meaningless without `moodId` set; always null when it is null. */
  trackId: string | null
  /**
   * Shown to the table: set when the DM first presents this scene, never unset. Players only ever see revealed
   * scenes (see campaignService.listSessionDecks/listNotes). Left out on decks presented before scenes were
   * revealed one by one — on those, every scene counts as revealed (see sceneRevealed).
   */
  revealed?: boolean
}

/** Whether players may see a deck's scene — revealed, or on a deck presented before scenes were revealed one by one. */
export function sceneRevealed(scene: SessionScene, scenes: SessionScene[], deckPresented: boolean): boolean {
  if (scene.revealed) return true
  return deckPresented && scenes.every((s) => s.revealed === undefined)
}

/** A deck's scenes with the old "everything presented is shown" rule written out as flags, before a new flag goes in. */
export function withRevealFlags(scenes: SessionScene[], deckPresented: boolean): SessionScene[] {
  return scenes.map((s) => ({ ...s, revealed: sceneRevealed(s, scenes, deckPresented) }))
}

export interface SessionDeck {
  id: string
  campaignId: string
  title: string
  scenes: SessionScene[]
  createdAt: string
  updatedAt: string
}

/** Where the DM currently is in a live presentation — `deckId: null` means nobody's presenting right now. Purely a cursor; the deck's actual content is fetched separately (sessionDecks.list). */
export interface LiveSceneState {
  deckId: string | null
  sceneIndex: number
}

/**
 * A block bounded by a line that's just `::` and the next line that's just
 * `::` is a DM-only section — NPC lines to remember, mood cues, private
 * hints to self, often spanning several lines/paragraphs of their own
 * formatting — kept in the DM's own editor view but never sent to players
 * at all (stripped server-side in campaignService's toNoteJson, not just
 * hidden client-side, so it never leaves the DM's machine):
 *
 *   ::
 *   **Description**
 *   - Rain outside.
 *
 *   **NPCs**
 *   - Martha Reed (bartender)
 *   ::
 *
 * An unclosed trailing `::` (the DM started a hidden section and hasn't
 * closed it yet) strips to the end of the note rather than leaking the rest
 * verbatim — better to over-hide a still-being-written aside than reveal one.
 */
export function stripDmAsides(bodyMarkdown: string): string {
  const lines = bodyMarkdown.split('\n')
  const kept: string[] = []
  let hidden = false
  for (const line of lines) {
    if (line.trim() === '::') {
      hidden = !hidden
      continue
    }
    if (!hidden) kept.push(line)
  }
  return kept.join('\n')
}
