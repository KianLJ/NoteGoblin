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
/** A scene's music cue: a Goblin Bard mood (see data/musicLibrary.ts), and a specific track in it or null for a random one. */
export interface SceneMusic {
  moodId: string
  trackId: string | null
}

const MAX_CUES = 12

/**
 * A scene as stored or sent, made safe: its lists of encounters and music, or — saved before a scene could have
 * several — its one encounter and one mood. Anything malformed is dropped. `revealed` is the caller's to set.
 */
export function readScene(raw: { noteId: string } & Record<string, unknown>): Omit<SessionScene, 'revealed'> {
  const str = (v: unknown): v is string => typeof v === 'string' && v !== ''
  const encounterIds = Array.isArray(raw.encounterIds) ? raw.encounterIds.filter(str) : str(raw.encounterId) ? [raw.encounterId] : []
  const music: SceneMusic[] = Array.isArray(raw.music)
    ? raw.music
        .filter((m): m is { moodId: string; trackId?: unknown } => !!m && typeof m === 'object' && str((m as { moodId?: unknown }).moodId))
        .map((m) => ({ moodId: m.moodId, trackId: str(m.trackId) ? m.trackId : null }))
    : str(raw.moodId)
      ? [{ moodId: raw.moodId, trackId: str(raw.trackId) ? raw.trackId : null }]
      : []
  return { noteId: raw.noteId, encounterIds: [...new Set(encounterIds)].slice(0, MAX_CUES), music: music.slice(0, MAX_CUES) }
}

export interface SessionScene {
  noteId: string
  /** Saved encounters (see src/renderer/src/data/savedEncounters.ts) the DM can load into the fight with one click while presenting this scene. Only ids — each roster stays in the DM's own saved-encounter store. */
  encounterIds: string[]
  /** Music cues: the first plays when the scene comes up; any of them can be played from the presenter bar. */
  music: SceneMusic[]
  /**
   * Shown to the table: set when the DM first presents this scene, never unset. Players only ever see revealed
   * scenes, and a session only once one of its scenes is (see campaignService.listSessionDecks/listNotes).
   */
  revealed?: boolean
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
 * `::` is hidden: in any note, only its author and the DM see it — NPC
 * lines to remember, mood cues, a player's private plans, often several
 * lines/paragraphs of their own formatting. It's stripped on the host
 * (campaignService's toNoteJson) before the note goes to anyone else, not
 * just hidden in their app, so it never reaches them:
 *
 *   ::
 *   **NPCs**
 *   - Martha Reed (bartender)
 *   ::
 *
 * An unclosed trailing `::` (a hidden section still being written) hides to
 * the end of the note rather than leaking the rest — better to over-hide
 * than reveal.
 */
// A fence: `::` alone, or an opening `::` naming who else may see the block — `:: @<userId> @<userId>`.
const FENCE = /^\s*::((?:\s+@[\w.:-]+)*)\s*$/

export function isHiddenFence(line: string): boolean {
  return FENCE.test(line)
}

/** The ids an opening fence names (`:: @a @b`) — the players besides the writer and the DM who may see its block. */
export function fenceAudience(line: string): string[] {
  const m = FENCE.exec(line)
  return m ? [...m[1].matchAll(/@([\w.:-]+)/g)].map((x) => x[1]) : []
}

/** An opening fence for these players (bare `::` for nobody else). */
export function fenceFor(audience: string[]): string {
  return ['::', ...audience.map((id) => `@${id}`)].join(' ')
}

export interface HiddenBlock {
  open: number
  /** null: it runs to the end of the note. */
  close: number | null
  /** Who else may see it, from its opening fence. */
  audience: string[]
}

/** The hidden blocks in a note's lines. */
export function hiddenBlocks(lines: string[]): HiddenBlock[] {
  const blocks: HiddenBlock[] = []
  let open: number | null = null
  lines.forEach((line, i) => {
    if (!isHiddenFence(line)) return
    if (open === null) open = i
    else {
      blocks.push({ open, close: i, audience: fenceAudience(lines[open]) })
      open = null
    }
  })
  if (open !== null) blocks.push({ open, close: null, audience: fenceAudience(lines[open]) })
  return blocks
}

/** A note's text as someone who isn't its writer or the DM gets it: the hidden blocks they're not named on taken out. */
export function stripDmAsides(bodyMarkdown: string, viewerId?: string): string {
  const lines = bodyMarkdown.split('\n')
  const hidden = new Set<number>()
  for (const b of hiddenBlocks(lines)) {
    if (viewerId && b.audience.includes(viewerId)) continue
    for (let i = b.open; i <= (b.close ?? lines.length - 1); i++) hidden.add(i)
  }
  return lines.filter((_, i) => !hidden.has(i)).join('\n')
}

/**
 * Someone who couldn't see some of a note's hidden blocks (another player
 * editing a shared note) saved `edited`: puts those blocks from `stored`
 * back, so their save never wipes what they were never shown. Each goes back
 * after the line it followed (the nearest non-blank line before it), found
 * again in the edited text; if that line's gone, the block goes at the end
 * rather than being lost. Blocks they could see were in what they edited.
 */
export function mergeHiddenBlocks(stored: string, edited: string, viewerId?: string): string {
  const lines = stored.split('\n')
  const blocks = hiddenBlocks(lines).filter((b) => !(viewerId && b.audience.includes(viewerId)))
  if (blocks.length === 0) return edited
  const out = edited.split('\n')
  let searchFrom = 0
  const atEnd: string[][] = []
  for (const b of blocks) {
    const body = lines.slice(b.open, (b.close ?? lines.length - 1) + 1)
    let a = b.open - 1
    while (a >= 0 && lines[a].trim() === '') a--
    // A line inside a block they couldn't see isn't an anchor they had.
    const anchor = a >= 0 && !blocks.some((o) => a >= o.open && a <= (o.close ?? lines.length - 1)) ? lines[a] : null
    if (anchor === null && a < 0) {
      out.splice(searchFrom, 0, ...body)
      searchFrom += body.length
      continue
    }
    const at = anchor === null ? -1 : out.indexOf(anchor, searchFrom)
    if (at === -1) {
      atEnd.push(body)
      continue
    }
    out.splice(at + 1, 0, ...body)
    searchFrom = at + 1 + body.length
  }
  for (const body of atEnd) out.push(...body)
  return out.join('\n')
}

/** What a hidden block says about who sees it, besides its writer and the DM. */
export function hiddenBlockLabel(audience: string[], nameOf: (userId: string) => string | undefined): string {
  if (audience.length === 0) return 'Hidden from other players'
  return `Hidden · also shown to ${audience.map((id) => nameOf(id) ?? 'a player').join(', ')}`
}
