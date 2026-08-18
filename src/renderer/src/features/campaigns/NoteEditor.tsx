import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { Note } from '@shared/ipc'
import { renderNoteMarkdown } from '../../markdown'
import { MarkdownLiveEditor, type MarkdownLiveEditorHandle } from './MarkdownLiveEditor'
import { EyeIcon, ImageIcon, ImportFromCodexIcon, LinkIcon, PencilIcon, TableIcon } from './icons'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { saveCustomMonster } from '../../data/customBestiary'
import { Bestiary } from '../bestiary/Bestiary'
import { statblockToFencedBlock } from '../../statblock'
import type { BestiaryMonster } from '../../data/bestiary'
import { performRoll } from '../dice/diceLogStore'
import type { DiceGroup } from '@shared/dice'

interface NoteEditorProps {
  note: Note
  /** Every note currently visible to you, across all sections — resolves [[Title]] wikilinks and feeds the link picker. Excludes nothing by visibility since you can only ever see what you're already allowed to. */
  notes: Note[]
  /** The hosted (DM) or joined (player) session id, if any — passed straight through to an inline `dice: ...` roll (see performRoll in diceLogStore.ts) so it reaches the rest of the table, not just this note's own log. */
  sessionId: string | null
  onSave: (patch: { title?: string; bodyMarkdown?: string }) => void
  /** Wikilink target matched an existing note by title — navigates by replacing the active tab (the "preview tab" pattern), not adding a new one. */
  onNavigateToNote: (noteId: string) => void
  /** Right-click a wikilink > "Open in new tab" — the explicit escape hatch for when you actually want a real, separate tab instead of reusing the active one. */
  onOpenInNewTab: (noteId: string) => void
  /** Wikilink target didn't match anything — create a note with that title (in this note's own visibility) and open it. */
  onCreateAndLinkNote: (title: string) => void
  /** True when the viewer is neither the author nor a granted editor — the server would reject a save anyway (see campaignService.updateNote), so the fields are made inert here too rather than silently discarding keystrokes on a failed autosave. */
  readOnly?: boolean
}

const AUTOSAVE_DELAY_MS = 700
const TABLE_TEMPLATE = '\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |\n'

/** Plain whitespace-split count, same rough definition every text editor uses — not trying to be markdown-aware (strip syntax, skip image data URIs, etc.), just a rough sense of how much is here. */
function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function formatCount(n: number): string {
  return n.toLocaleString()
}

/**
 * Keyed by note.id from the parent, so switching notes remounts this with
 * fresh local state instead of leaking edits between files.
 *
 * "Write" mode is an Obsidian-style Live Preview (see MarkdownLiveEditor) —
 * headers/bold/italic/wikilinks render inline in the same single pane
 * you're editing, un-rendering back to raw syntax right where your cursor
 * is so you can change it. "Preview" is the fully rendered, read-only view
 * (tables and images included — those don't have a sensible "live" inline
 * form, so they only show up here, not in Write mode).
 *
 * The title field is uncontrolled (defaultValue, not value) for the same
 * reason CodeMirror owns its own document instead of a controlled React
 * string: fighting the field's own undo/edit state from React on every
 * keystroke is what broke Ctrl+Z originally.
 */
export function NoteEditor({
  note,
  notes,
  sessionId,
  onSave,
  onNavigateToNote,
  onOpenInNewTab,
  onCreateAndLinkNote,
  readOnly
}: NoteEditorProps): JSX.Element {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.bodyMarkdown)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)
  const [linkMenu, setLinkMenu] = useState<ContextMenuState | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const [bestiaryPickerOpen, setBestiaryPickerOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const editorRef = useRef<MarkdownLiveEditorHandle>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleFocusedRef = useRef(false)
  const linkPickerRef = useRef<HTMLDivElement>(null)
  const knownTitlesRef = useRef<Set<string>>(new Set())
  const notesRef = useRef<Note[]>(notes)
  // What we've last reconciled `note.title`/`note.bodyMarkdown` against —
  // distinct from `title`/`body` (the locally-edited value) so an external
  // update (someone else's edit arriving via campaigns.onChanged) can be told
  // apart from our own save round-tripping back through the same prop.
  const lastRemoteTitleRef = useRef(note.title)
  const lastRemoteBodyRef = useRef(note.bodyMarkdown)

  const knownTitles = useMemo(() => new Set(notes.map((n) => (n.title || 'Untitled').toLowerCase())), [notes])
  knownTitlesRef.current = knownTitles
  notesRef.current = notes

  function scheduleSave(patch: { title?: string; bodyMarkdown?: string }): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSave(patch), AUTOSAVE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Adopts an external edit (title/body changed by someone else, pushed in
  // via campaigns.onChanged → refresh) while this same note stays open —
  // but only while the field isn't focused, so it never clobbers keystrokes
  // that haven't autosaved yet. If you're mid-edit when it arrives, it's
  // simply skipped; your own next save overwrites the server anyway.
  useEffect(() => {
    if (note.title !== lastRemoteTitleRef.current) {
      lastRemoteTitleRef.current = note.title
      if (!titleFocusedRef.current) {
        setTitle(note.title)
        if (titleInputRef.current) titleInputRef.current.value = note.title
      }
    }
    if (note.bodyMarkdown !== lastRemoteBodyRef.current) {
      lastRemoteBodyRef.current = note.bodyMarkdown
      if (!editorRef.current?.hasFocus()) {
        setBody(note.bodyMarkdown)
        editorRef.current?.setContent(note.bodyMarkdown)
      }
    }
  }, [note.title, note.bodyMarkdown])

  // Ctrl+E toggles write/preview — mirrors the toolbar eye/pencil button, just
  // from the keyboard. Scoped to this note's lifetime since NoteEditor
  // remounts fresh per open note (see the component doc comment).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'e') return
      e.preventDefault()
      setMode((m) => (m === 'write' ? 'preview' : 'write'))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!linkPickerOpen) return
    function handleClickOutside(e: MouseEvent): void {
      if (linkPickerRef.current && !linkPickerRef.current.contains(e.target as Node)) setLinkPickerOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [linkPickerOpen])

  function handleBodyChange(value: string): void {
    setBody(value)
    scheduleSave({ bodyMarkdown: value })
  }

  function insertText(text: string): void {
    if (mode !== 'write') setMode('write')
    editorRef.current?.insertText(text)
  }

  async function handleInsertImage(): Promise<void> {
    const result = await window.goblin.files.pickImage()
    if (!result.ok) return
    insertText(`![${result.data.fileName}](${result.data.dataUrl})`)
  }

  function handleBestiaryPick(monster: BestiaryMonster): void {
    insertText(`\n${statblockToFencedBlock(monster)}\n`)
    setBestiaryPickerOpen(false)
  }

  function handlePickLink(target: Note): void {
    insertText(`[[${target.title || 'Untitled'}]]`)
    setLinkPickerOpen(false)
    setLinkQuery('')
  }

  function findWikilinkTarget(target: string): Note | undefined {
    return notes.find((n) => (n.title || 'Untitled').toLowerCase() === target.toLowerCase())
  }

  function resolveWikilink(target: string): void {
    const match = findWikilinkTarget(target)
    if (match) onNavigateToNote(match.id)
    else onCreateAndLinkNote(target)
  }

  /** An inline `` `dice: 2d6 + 3` `` roll — clicked either as a rendered button in Preview mode (parsed from its `data-dice-roll` JSON) or in Write mode's live-preview widget (see MarkdownLiveEditor.tsx's onDiceRoll prop) — always a public roll (there's no "private roll" toggle inline in a note, only in the Dice Tray itself), rolled through the same shared log/broadcast path so it shows up there too. */
  function rollFromDice(dice: { sides: DiceGroup['sides']; count: number; modifier: number }): void {
    void window.goblin.identity.getCurrent().then((identity) => {
      performRoll(sessionId, identity?.id ?? 'me', identity?.displayName ?? 'You', [{ sides: dice.sides, count: dice.count }], dice.modifier, false)
    })
  }

  function handlePreviewClick(e: ReactMouseEvent<HTMLDivElement>): void {
    const diceBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-dice-roll]')
    if (diceBtn) {
      e.preventDefault()
      try {
        rollFromDice(JSON.parse(diceBtn.dataset.diceRoll ?? '{}'))
      } catch {
        /* malformed dice-roll JSON — nothing sensible to roll */
      }
      return
    }
    const saveBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-save-statblock]')
    if (saveBtn) {
      e.preventDefault()
      try {
        const data = JSON.parse(saveBtn.dataset.saveStatblock ?? '{}')
        const saved = saveCustomMonster(data)
        saveBtn.textContent = `Saved: ${saved.name}`
      } catch {
        /* malformed statblock JSON — nothing sensible to save */
      }
      return
    }
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
    if (!link) return
    e.preventDefault()
    resolveWikilink(link.dataset.wikilink as string)
  }

  /** Right-click on a resolved wikilink — a broken one has no target to open, so no menu. */
  function handleWikilinkContextMenu(target: string, x: number, y: number): void {
    const match = findWikilinkTarget(target)
    if (!match) return
    setLinkMenu({ x, y, items: [{ label: 'Open in new tab', onSelect: () => onOpenInNewTab(match.id) }] })
  }

  function handlePreviewContextMenu(e: ReactMouseEvent<HTMLDivElement>): void {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
    if (!link) return
    e.preventDefault()
    handleWikilinkContextMenu(link.dataset.wikilink as string, e.clientX, e.clientY)
  }

  const currentWordCount = useMemo(() => wordCount(body), [body])
  // Substitutes the live `body` for this note's own contribution — `notes`
  // carries everyone's last-saved content, so without this the total would
  // lag your own still-unsaved keystrokes by up to the autosave delay.
  const campaignWordCount = useMemo(
    () => notes.reduce((sum, n) => sum + wordCount(n.id === note.id ? body : n.bodyMarkdown), 0),
    [notes, note.id, body]
  )

  const renderedHtml = useMemo(() => renderNoteMarkdown(body, knownTitles, note.campaignId), [body, knownTitles, note.campaignId])
  const linkableNotes = useMemo(
    () =>
      notes
        .filter((n) => n.id !== note.id)
        .filter((n) => (n.title || 'Untitled').toLowerCase().includes(linkQuery.toLowerCase())),
    [notes, note.id, linkQuery]
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'var(--space-5)', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)'
        }}
      >
        <input
          ref={titleInputRef}
          readOnly={readOnly}
          defaultValue={note.title}
          onChange={(e) => {
            if (readOnly) return
            setTitle(e.target.value)
            scheduleSave({ title: e.target.value })
          }}
          onFocus={() => {
            titleFocusedRef.current = true
          }}
          onBlur={() => {
            titleFocusedRef.current = false
            if (!readOnly) onSave({ title })
          }}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
          {readOnly && <span className="gb-badge">View only</span>}
          <span
            className={`gb-badge ${
              note.visibility === 'dm' ? 'gb-badge--danger' : note.visibility === 'private' ? 'gb-badge--accent' : 'gb-badge--success'
            }`}
          >
            {note.visibility === 'dm' ? 'DM Only' : note.visibility === 'private' ? 'Private' : 'Party'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          marginBottom: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 'var(--space-2)'
        }}
      >
        {mode === 'write' && !readOnly && (
          <>
            <ToolbarButton title="Insert image" onClick={() => void handleInsertImage()}>
              <ImageIcon />
            </ToolbarButton>
            <div ref={linkPickerRef} style={{ position: 'relative' }}>
              <ToolbarButton title="Link a note" onClick={() => setLinkPickerOpen((o) => !o)}>
                <LinkIcon />
              </ToolbarButton>
              {linkPickerOpen && (
                <div
                  className="gb-card"
                  style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 240, padding: 'var(--space-2)', zIndex: 20 }}
                >
                  <input
                    autoFocus
                    className="gb-input"
                    placeholder="Find a note…"
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    style={{ fontSize: 13, marginBottom: 6 }}
                  />
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {linkableNotes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handlePickLink(n)}
                        style={{
                          textAlign: 'left',
                          padding: '5px 6px',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-sunken)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {n.title || 'Untitled'}
                      </button>
                    ))}
                    {linkableNotes.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>No matches</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <ToolbarButton title="Insert table" onClick={() => insertText(TABLE_TEMPLATE)}>
              <TableIcon />
            </ToolbarButton>
            <ToolbarButton title="Import from Codex" onClick={() => setBestiaryPickerOpen(true)}>
              <ImportFromCodexIcon />
            </ToolbarButton>
            <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', margin: '0 4px' }} />
          </>
        )}
        <ToolbarButton
          title={mode === 'write' ? 'Preview' : 'Back to editing'}
          onClick={() => setMode((m) => (m === 'write' ? 'preview' : 'write'))}
        >
          {mode === 'write' ? <EyeIcon /> : <PencilIcon />}
        </ToolbarButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: mode === 'write' ? 'block' : 'none' }}>
        <MarkdownLiveEditor
          ref={editorRef}
          defaultValue={note.bodyMarkdown}
          campaignId={note.campaignId}
          knownTitlesRef={knownTitlesRef}
          notesRef={notesRef}
          onChange={handleBodyChange}
          onWikilinkClick={resolveWikilink}
          onWikilinkContextMenu={handleWikilinkContextMenu}
          onDiceRoll={rollFromDice}
          readOnly={readOnly}
        />
      </div>
      {mode === 'preview' && (
        <div
          className="gb-markdown"
          onClick={handlePreviewClick}
          onContextMenu={handlePreviewContextMenu}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
        by {note.authorDisplayName}
      </div>

      <div
        title={`${formatCount(currentWordCount)} words in this note — ${formatCount(campaignWordCount)} across the whole campaign`}
        style={{
          position: 'absolute',
          // Extra clearance (not just var(--space-2)) — this pane's own
          // bottom-right corner coincides with the window's when the right
          // panel is closed, which is exactly where VersionBadge (fixed to
          // the viewport, not this pane) also sits.
          bottom: 20,
          right: 'var(--space-3)',
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          padding: '1px 6px',
          borderRadius: 'var(--radius-sm)',
          pointerEvents: 'none'
        }}
      >
        {formatCount(currentWordCount)} words · {formatCount(campaignWordCount)} campaign
      </div>

      <ContextMenu state={linkMenu} onClose={() => setLinkMenu(null)} />
      {bestiaryPickerOpen && <Bestiary onClose={() => setBestiaryPickerOpen(false)} onPick={handleBestiaryPick} />}
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 8,
        borderRadius: 'var(--radius-sm)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-sunken)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.color = 'var(--text-muted)'
      }}
    >
      {children}
    </button>
  )
}
