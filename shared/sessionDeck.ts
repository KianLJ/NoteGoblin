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
  return {
    noteId: raw.noteId,
    encounterIds: [...new Set(encounterIds)].slice(0, MAX_CUES),
    music: music.slice(0, MAX_CUES),
    // Only stored when they differ from the defaults (music plays, the fight waits for a click).
    ...(raw.autoMusic === false ? { autoMusic: false } : {}),
    ...(raw.autoEncounter === true ? { autoEncounter: true } : {}),
    ...(raw.visibility === 'shown' || raw.visibility === 'hidden' ? { visibility: raw.visibility } : {}),
    ...(raw.hiddenNotice === false ? { hiddenNotice: false } : {}),
    ...(typeof raw.hiddenLabel === 'string' && raw.hiddenLabel.trim() ? { hiddenLabel: raw.hiddenLabel.trim().slice(0, 80) } : {})
  }
}

/** What a player sees on a hidden part of a scene that's shown only to them, unless the DM words it differently. */
export const DEFAULT_HIDDEN_LABEL = 'Hidden - Only Shown to You'

/**
 * Whether a player can see a scene in the Sessions box: the DM's choice if they made one, otherwise only once
 * it's been presented while that player was at the table — joining later doesn't show what they missed.
 */
export function sceneVisibleTo(scene: Pick<SessionScene, 'visibility' | 'revealed' | 'seenBy'>, userId: string): boolean {
  if (scene.visibility) return scene.visibility === 'shown'
  return !!scene.revealed && !!scene.seenBy?.includes(userId)
}

/**
 * A note's text with the opening and closing lines of the hidden blocks a
 * reader can see taken out, so those parts read as ordinary text — for a
 * scene whose DM doesn't want players told a part is just for them. Run it
 * after stripDmAsides (which has already removed the blocks they can't see).
 */
export function unmarkHiddenBlocks(bodyMarkdown: string): string {
  return bodyMarkdown
    .split('\n')
    .filter((line) => !isHiddenFence(line))
    .join('\n')
}

export interface SessionScene {
  noteId: string
  /** Saved encounters (see src/renderer/src/data/savedEncounters.ts) the DM can load into the fight with one click while presenting this scene. Only ids — each roster stays in the DM's own saved-encounter store. */
  encounterIds: string[]
  /** Music cues: the first plays when the scene comes up (unless autoMusic is off); any of them can be played from the presenter bar. */
  music: SceneMusic[]
  /** The first music cue plays by itself when the scene comes up. On unless set false. */
  autoMusic?: boolean
  /** The first encounter goes into the fight by itself when the scene first comes up in a presentation. Off unless set true. */
  autoEncounter?: boolean
  /**
   * Presented at least once: set when the DM first presents this scene, never unset. Who it's shown to after
   * that is `seenBy` (see sceneVisibleTo, campaignService.listSessionDecks/listNotes).
   */
  revealed?: boolean
  /** The players who were at the table while it was presented — the ones it shows for in their Sessions box. Kept by the host, not editable. */
  seenBy?: string[]
  /** The DM's own say: always shown to every player, or never. Unset, it follows `seenBy`. */
  visibility?: 'shown' | 'hidden'
  /** Players see their hidden parts as a labelled box (on unless set false); off, those parts read as ordinary text. */
  hiddenNotice?: boolean
  /** That label, if the DM changed it from DEFAULT_HIDDEN_LABEL. */
  hiddenLabel?: string
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
export function hiddenBlockLabel(audience: string[], nameOf: (userId: string) => string | undefined, viewer?: { userId: string; label?: string }): string {
  // A player reading a part that's there for them.
  if (viewer && audience.includes(viewer.userId)) {
    const others = audience.filter((id) => id !== viewer.userId)
    if (others.length === 0) return viewer.label || DEFAULT_HIDDEN_LABEL
    return `Hidden - Shown to You and ${others.map((id) => nameOf(id) ?? 'a player').join(', ')}`
  }
  if (audience.length === 0) return 'Hidden from other players'
  return `Hidden · also shown to ${audience.map((id) => nameOf(id) ?? 'a player').join(', ')}`
}
