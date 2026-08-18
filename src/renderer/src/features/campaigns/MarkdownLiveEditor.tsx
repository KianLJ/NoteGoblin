import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Compartment, EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource
} from '@codemirror/autocomplete'
import { WIKILINK_PATTERN, wikilinkIsDouble, wikilinkTarget } from '../../wikilink'
import { resolveImageSrc } from '../../imageSrc'
import { renderNoteMarkdown } from '../../markdown'
import type { Note } from '@shared/ipc'

export interface MarkdownLiveEditorHandle {
  insertText: (text: string) => void
  focus: () => void
  hasFocus: () => boolean
  /** Replaces the whole document — for adopting an external update (e.g. someone else's edit arriving over a session), never called while the user is actively typing here. */
  setContent: (value: string) => void
}

interface MarkdownLiveEditorProps {
  defaultValue: string
  /** For rewriting a relative (real vault file) image src to vault-asset:// — see resolveImageSrc. */
  campaignId: string
  /** Read via a ref rather than passed by value so a rebuild (triggered by typing/selection, not by this changing) always sees the latest set without needing its own dispatch pipeline. */
  knownTitlesRef: { current: Set<string> }
  /** Same ref pattern — feeds the note-link autocomplete popup with the current title list without a dispatch pipeline. */
  notesRef: { current: Note[] }
  onChange: (value: string) => void
  onWikilinkClick: (target: string) => void
  /** Right-click on a resolved wikilink — omit to leave right-click doing nothing special. */
  onWikilinkContextMenu?: (target: string, x: number, y: number) => void
  /** Blocks actual document edits at the CodeMirror level (no cursor, no typing, paste rejected) — not a CSS overlay, which only stops mouse-driven interaction and leaves keyboard input (e.g. Tab-focusing in) still able to "type" locally even though nothing would ever save. Reconfigurable live via a Compartment since editorUserIds can change while a note's already open. */
  readOnly?: boolean
}

const MAX_LINK_SUGGESTIONS = 20

/**
 * Fires once you're typing inside an unclosed `[…` on the current line
 * (`[` auto-closes to `[]` with the cursor placed between via
 * `closeBrackets()`, so this activates immediately). Lists notes whose
 * title contains what's typed so far; picking one finishes the link and
 * consumes the auto-inserted `]` that's already sitting right after the
 * cursor, so you don't end up with `[Title]]`.
 */
function noteLinkCompletionSource(notesRef: { current: Note[] }): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[[^[\]\n]*/)
    if (!match) return null
    const query = match.text.slice(1).toLowerCase()
    const seen = new Set<string>()
    const options = notesRef.current
      .map((n) => n.title || 'Untitled')
      .filter((title) => {
        if (seen.has(title.toLowerCase())) return false
        seen.add(title.toLowerCase())
        return title.toLowerCase().includes(query)
      })
      .slice(0, MAX_LINK_SUGGESTIONS)
      .map((title) => ({
        label: title,
        apply(view: EditorView, _completion: unknown, from: number, to: number) {
          const hasClosingBracket = view.state.sliceDoc(to, to + 1) === ']'
          const end = hasClosingBracket ? to + 1 : to
          view.dispatch({
            changes: { from, to: end, insert: `${title}]` },
            selection: { anchor: from + title.length + 1 }
          })
        }
      }))
    if (options.length === 0) return null
    return { from: match.from + 1, options, filter: false }
  }
}

const WIKILINK_RE = new RegExp(WIKILINK_PATTERN, 'g')
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
/** Bare `data:` payload, valid image syntax or not — see the fallback pass below. */
const DATA_URI_RE = /data:[^\s)\]]{40,}/g

function selectionOverlaps(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

/**
 * Shared by the Table and ```statblock cases below — block widgets must
 * start/end exactly on line boundaries, so this expands the syntax node's
 * range to the containing lines before deciding whether to reveal raw text
 * (selection overlap) or replace it with the rendered widget. Returns true
 * when the widget was actually applied, so the caller can (a) stop the tree
 * walk from descending into this node's children and (b) skip these same
 * lines in the per-line wikilink/image scan below — a nested decoration
 * inside an already-fully-replaced block range would collide with it
 * (CodeMirror doesn't allow overlapping replace decorations).
 */
function replaceBlockWithWidget(
  state: EditorState,
  doc: Text,
  ranges: Range<Decoration>[],
  nodeFrom: number,
  nodeTo: number,
  knownTitles: Set<string>,
  campaignId: string
): boolean {
  const from = doc.lineAt(nodeFrom).from
  const to = doc.lineAt(nodeTo).to
  if (selectionOverlaps(state, from, to)) return false
  const html = renderNoteMarkdown(doc.sliceString(from, to), knownTitles, campaignId)
  ranges.push(Decoration.replace({ widget: new BlockHtmlWidget(html), block: true }).range(from, to))
  return true
}

/** Renders `![alt](src)` as an actual `<img>` in place — unlike the text-level decorations above, an image has no "collapsed label" to show, so it's just replaced outright (raw syntax reappears when the selection is on that line, same reveal rule as everything else). */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-live-image'
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Renders a ```statblock fenced block or a GFM table as the same rendered HTML the Preview pane shows (via renderNoteMarkdown, so statblock cards/tables — and any wikilinks inside a table cell — stay in perfect sync with Preview) instead of raw source, while the cursor/selection is elsewhere on it. Raw syntax reappears on click, same reveal rule as everything else in this file. */
class BlockHtmlWidget extends WidgetType {
  constructor(readonly html: string) {
    super()
  }

  eq(other: BlockHtmlWidget): boolean {
    return other.html === this.html
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'gb-markdown cm-live-block'
    wrap.innerHTML = this.html
    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Obsidian-style "Live Preview": formatting (headers, bold, italic,
 * [[wikilinks]] and [single-bracket] links) renders inline while the
 * document stays a single plain markdown string underneath — the marker
 * characters (`#`, `**`, brackets) are hidden via zero-width replace
 * decorations UNLESS the current selection overlaps that range, in which
 * case the raw syntax shows so you can edit it directly. Rebuilt from the
 * syntax tree (for headers/emphasis) plus a manual wikilink scan (not part
 * of standard markdown, lezer's parser doesn't know about it — see
 * wikilink.ts) on every doc/selection change.
 */
function buildDecorations(view: EditorView, knownTitles: Set<string>, campaignId: string): DecorationSet {
  const state = view.state
  const doc = state.doc
  const tree = syntaxTree(state)
  const ranges: Range<Decoration>[] = []
  // Line ranges fully consumed by a Table/statblock widget — excluded from
  // the per-line wikilink/image scan below (see replaceBlockWithWidget).
  const hiddenBlockRanges: Array<[number, number]> = []

  tree.iterate({
    enter(node) {
      const headingMatch = /^ATXHeading([1-6])$/.exec(node.name)
      if (headingMatch) {
        const level = headingMatch[1]
        const line = doc.lineAt(node.from)
        ranges.push(Decoration.line({ class: `cm-live-h${level}` }).range(line.from))
        if (!selectionOverlaps(state, line.from, line.to)) {
          const markNode = node.node.getChild('HeaderMark')
          if (markNode) {
            let end = markNode.to
            if (doc.sliceString(end, end + 1) === ' ') end += 1
            if (markNode.from < end) ranges.push(Decoration.replace({}).range(markNode.from, end))
          }
        }
        return
      }
      if (node.name === 'StrongEmphasis' || node.name === 'Emphasis') {
        const cls = node.name === 'StrongEmphasis' ? 'cm-live-bold' : 'cm-live-italic'
        ranges.push(Decoration.mark({ class: cls }).range(node.from, node.to))
        if (!selectionOverlaps(state, node.from, node.to)) {
          for (const mark of node.node.getChildren('EmphasisMark')) {
            ranges.push(Decoration.replace({}).range(mark.from, mark.to))
          }
        }
        return
      }
      // A ```statblock fenced block or a GFM table — same widget, same
      // reveal-on-selection rule as images above, rendered via the exact
      // same renderNoteMarkdown Preview uses so it never drifts out of sync.
      if (node.name === 'Table') {
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        const applied = replaceBlockWithWidget(state, doc, ranges, node.from, node.to, knownTitles, campaignId)
        if (applied) {
          hiddenBlockRanges.push([from, to])
          return false
        }
        return
      }
      if (node.name === 'FencedCode') {
        const infoNode = node.node.getChild('CodeInfo')
        const lang = infoNode ? doc.sliceString(infoNode.from, infoNode.to).trim().toLowerCase() : ''
        if (lang === 'statblock') {
          const from = doc.lineAt(node.from).from
          const to = doc.lineAt(node.to).to
          const applied = replaceBlockWithWidget(state, doc, ranges, node.from, node.to, knownTitles, campaignId)
          if (applied) {
            hiddenBlockRanges.push([from, to])
            return false
          }
        }
      }
    }
  })

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (hiddenBlockRanges.some(([from, to]) => line.from >= from && line.to <= to)) continue
    WIKILINK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKILINK_RE.exec(line.text))) {
      const from = line.from + match.index
      const to = from + match[0].length
      if (selectionOverlaps(state, from, to)) continue
      const target = wikilinkTarget(match)
      const isDouble = wikilinkIsDouble(match)
      const bracketLen = isDouble ? 2 : 1
      const rawTarget = isDouble ? match[1] : match[3]
      const rawAliasPresent = (isDouble ? match[2] : match[4]) !== undefined
      const labelStart = from + bracketLen + (rawAliasPresent ? rawTarget.length + 1 : 0)
      const labelEnd = to - bracketLen
      const resolved = knownTitles.has(target.toLowerCase())
      if (from < labelStart) ranges.push(Decoration.replace({}).range(from, labelStart))
      ranges.push(
        Decoration.mark({
          class: resolved ? 'cm-live-wikilink' : 'cm-live-wikilink cm-live-wikilink--broken',
          attributes: { 'data-wikilink': target }
        }).range(labelStart, labelEnd)
      )
      if (labelEnd < to) ranges.push(Decoration.replace({}).range(labelEnd, to))
    }

    IMAGE_RE.lastIndex = 0
    let imageMatch: RegExpExecArray | null
    const imageSpansOnLine: Array<[number, number]> = []
    while ((imageMatch = IMAGE_RE.exec(line.text))) {
      const from = line.from + imageMatch.index
      const to = from + imageMatch[0].length
      imageSpansOnLine.push([from, to])
      const alt = imageMatch[1]
      const src = imageMatch[2]
      // "![alt]" — the visible part even while editing this line.
      const altTextEnd = from + 2 + alt.length + 1
      // The `(src)` portion is always hidden, focused or not: it's a data:
      // URI that can run to hundreds of KB of base64, not something anyone
      // hand-edits, and showing it inline was flooding the line with text.
      if (altTextEnd < to) ranges.push(Decoration.replace({}).range(altTextEnd, to))
      if (selectionOverlaps(state, from, to)) {
        // Focused: leave "![alt]" as plain editable text so the alt text
        // itself can still be changed.
        continue
      }
      ranges.push(Decoration.replace({ widget: new ImageWidget(resolveImageSrc(campaignId, src), alt) }).range(from, altTextEnd))
    }

    // Fallback for a broken image tag — e.g. one of the brackets around
    // "![alt]" got deleted mid-edit, so IMAGE_RE above no longer matches.
    // Still hide any bare data: URI payload on the line even without valid
    // syntax around it; otherwise the full base64 payload (which can run to
    // hundreds of KB) gets dumped onto the screen as an unreadable wall of
    // text until the syntax is fixed.
    DATA_URI_RE.lastIndex = 0
    let dataMatch: RegExpExecArray | null
    while ((dataMatch = DATA_URI_RE.exec(line.text))) {
      const from = line.from + dataMatch.index
      const to = from + dataMatch[0].length
      if (imageSpansOnLine.some(([s, e]) => from < e && to > s)) continue
      ranges.push(Decoration.replace({}).range(from, to))
    }
  }

  return Decoration.set(ranges, true)
}

function livePreviewExtension(
  knownTitlesRef: { current: Set<string> },
  campaignId: string,
  onWikilinkClick: (target: string) => void,
  onWikilinkContextMenu?: (target: string, x: number, y: number) => void
): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, knownTitlesRef.current, campaignId)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, knownTitlesRef.current, campaignId)
        }
      }
    },
    { decorations: (v) => v.decorations }
  )
  const clickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
      if (!el) return false
      // Clicking a rendered (collapsed) wikilink navigates, matching the
      // read-only Preview pane — since it's only rendered collapsed when the
      // selection isn't already on it, this never fires while you're mid-edit.
      event.preventDefault()
      onWikilinkClick(el.dataset.wikilink as string)
      view.focus()
      return true
    },
    contextmenu(event) {
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
      if (!el || !onWikilinkContextMenu) return false
      event.preventDefault()
      onWikilinkContextMenu(el.dataset.wikilink as string, event.clientX, event.clientY)
      return true
    }
  })
  return [plugin, clickHandler, imagePasteHandler, imageDropHandler]
}

const MAX_PASTED_IMAGE_BYTES = 8 * 1024 * 1024

/** Reads an image file as a data: URI, resolving to its markdown (`![alt](data:...)`) or null if it's over the size cap. */
function readImageMarkdown(file: File): Promise<string | null> {
  if (file.size > MAX_PASTED_IMAGE_BYTES) {
    console.error(`"${file.name}" is too large (max 8 MB) — try a smaller image, or insert it as a file instead.`)
    return Promise.resolve(null)
  }
  const alt = file.name.replace(/\.[^.]+$/, '') || 'Pasted image'
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      resolve(typeof dataUrl === 'string' ? `![${alt}](${dataUrl})` : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/** Inserts one dropped/pasted image's markdown at `pos` — the current selection if `pos` is undefined. */
async function insertImageFile(view: EditorView, file: File, pos?: number): Promise<void> {
  const insert = await readImageMarkdown(file)
  if (insert === null) return
  if (pos === undefined) {
    view.dispatch(view.state.replaceSelection(insert))
  } else {
    view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } })
  }
}

/** Inserts several dropped files' markdown one after another, each on its own line, starting at `pos` — sequential (not parallel) so each insert's position accounts for the ones before it instead of racing to the same stale offset. */
async function insertImageFiles(view: EditorView, files: File[], pos: number): Promise<void> {
  let at = pos
  for (const file of files) {
    const markdown = await readImageMarkdown(file)
    if (markdown === null) continue
    const insert = at === pos ? markdown : `\n${markdown}`
    view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } })
    at += insert.length
  }
}

/**
 * Without this, pasting an actual image (e.g. a screenshot) falls through
 * to the browser's default paste handling, which — since a textarea/
 * contenteditable has no idea what to do with binary image data — was
 * dumping some text representation of it straight into the note instead of
 * embedding it properly. Intercepts image clipboard data specifically and
 * inserts real `![Pasted image](data:...)` markdown, same as the toolbar's
 * file-picker path.
 */
const imagePasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    if (!view.contentDOM.isContentEditable) return false
    const items = event.clipboardData?.items
    if (!items) return false
    const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'))
    if (!imageItem) return false
    const file = imageItem.getAsFile()
    if (!file) return false
    event.preventDefault()
    void insertImageFile(view, file)
    return true
  }
})

/** Dragging an image file (from the OS file explorer, a browser, etc.) onto the editor embeds it at the drop position, same markdown as paste/the toolbar's file picker. */
const imageDropHandler = EditorView.domEventHandlers({
  dragover(event) {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return false
    event.preventDefault()
    return false
  },
  drop(event, view) {
    if (!view.contentDOM.isContentEditable) return false
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return false
    event.preventDefault()
    const coords = view.posAtCoords({ x: event.clientX, y: event.clientY })
    const pos = coords ?? view.state.selection.main.head
    void insertImageFiles(view, files, pos)
    return true
  }
})

export const MarkdownLiveEditor = forwardRef<MarkdownLiveEditorHandle, MarkdownLiveEditorProps>(
  function MarkdownLiveEditor(
    { defaultValue, campaignId, knownTitlesRef, notesRef, onChange, onWikilinkClick, onWikilinkContextMenu, readOnly },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const readOnlyCompartment = useRef(new Compartment()).current

    useEffect(() => {
      if (!containerRef.current) return
      const view = new EditorView({
        state: EditorState.create({
          doc: defaultValue,
          extensions: [
            readOnlyCompartment.of(EditorView.editable.of(!readOnly)),
            history(),
            closeBrackets(),
            autocompletion({ override: [noteLinkCompletionSource(notesRef)] }),
            keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
            markdown({ extensions: [GFM] }),
            EditorView.lineWrapping,
            livePreviewExtension(knownTitlesRef, campaignId, onWikilinkClick, onWikilinkContextMenu),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChange(update.state.doc.toString())
            }),
            EditorView.theme({
              '&': { height: '100%', fontSize: '14px', color: 'var(--text-primary)', backgroundColor: 'transparent' },
              '&.cm-focused': { outline: 'none' },
              '.cm-content': { fontFamily: 'var(--font-body)', lineHeight: '1.7', padding: 0, caretColor: 'var(--text-primary)' },
              '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text-primary)' },
              '.cm-scroller': { fontFamily: 'var(--font-body)', overflow: 'auto' },
              '.cm-gutters': { display: 'none' },
              '.cm-line': { padding: 0 },
              '.cm-tooltip.cm-tooltip-autocomplete': {
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-md)',
                overflow: 'hidden'
              },
              '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-body)', fontSize: '13px' },
              '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { color: 'var(--text-primary)', padding: '4px 8px' },
              '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                background: 'var(--accent-subtle)',
                color: 'var(--accent-hover)'
              }
            })
          ]
        }),
        parent: containerRef.current
      })
      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
      // Only ever constructed once per mount — the parent remounts this
      // whole component (key={note.id}) when switching notes, same as the
      // old textarea did.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // readOnly CAN change without a remount — e.g. the author grants you
    // edit access via the party sidebar while you already have the note
    // open — so reconfigure the live view instead of only reading it once.
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)) })
    }, [readOnly, readOnlyCompartment])

    useImperativeHandle(ref, () => ({
      insertText(text: string) {
        const view = viewRef.current
        if (!view) return
        view.dispatch(view.state.replaceSelection(text))
        view.focus()
      },
      focus() {
        viewRef.current?.focus()
      },
      hasFocus() {
        return viewRef.current?.hasFocus ?? false
      },
      setContent(value: string) {
        const view = viewRef.current
        if (!view) return
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
      }
    }))

    return <div ref={containerRef} style={{ height: '100%', overflow: 'auto' }} />
  }
)
