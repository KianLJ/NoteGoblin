import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, type Extension, type Range } from '@codemirror/state'
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
import type { Note } from '@shared/ipc'

export interface MarkdownLiveEditorHandle {
  insertText: (text: string) => void
  focus: () => void
}

interface MarkdownLiveEditorProps {
  defaultValue: string
  /** Read via a ref rather than passed by value so a rebuild (triggered by typing/selection, not by this changing) always sees the latest set without needing its own dispatch pipeline. */
  knownTitlesRef: { current: Set<string> }
  /** Same ref pattern — feeds the note-link autocomplete popup with the current title list without a dispatch pipeline. */
  notesRef: { current: Note[] }
  onChange: (value: string) => void
  onWikilinkClick: (target: string) => void
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

function selectionOverlaps(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from)
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
function buildDecorations(view: EditorView, knownTitles: Set<string>): DecorationSet {
  const state = view.state
  const doc = state.doc
  const tree = syntaxTree(state)
  const ranges: Range<Decoration>[] = []

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
      }
    }
  })

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
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
    while ((imageMatch = IMAGE_RE.exec(line.text))) {
      const from = line.from + imageMatch.index
      const to = from + imageMatch[0].length
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
      ranges.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(from, altTextEnd))
    }
  }

  return Decoration.set(ranges, true)
}

function livePreviewExtension(knownTitlesRef: { current: Set<string> }, onWikilinkClick: (target: string) => void): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, knownTitlesRef.current)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, knownTitlesRef.current)
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
    }
  })
  return [plugin, clickHandler, imagePasteHandler]
}

const MAX_PASTED_IMAGE_BYTES = 8 * 1024 * 1024

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
    const items = event.clipboardData?.items
    if (!items) return false
    const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'))
    if (!imageItem) return false
    const file = imageItem.getAsFile()
    if (!file) return false
    event.preventDefault()
    if (file.size > MAX_PASTED_IMAGE_BYTES) {
      console.error('Pasted image is too large (max 8 MB) — try a smaller one, or insert it as a file instead.')
      return true
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      view.dispatch(view.state.replaceSelection(`![Pasted image](${dataUrl})`))
    }
    reader.readAsDataURL(file)
    return true
  }
})

export const MarkdownLiveEditor = forwardRef<MarkdownLiveEditorHandle, MarkdownLiveEditorProps>(
  function MarkdownLiveEditor({ defaultValue, knownTitlesRef, notesRef, onChange, onWikilinkClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    useEffect(() => {
      if (!containerRef.current) return
      const view = new EditorView({
        state: EditorState.create({
          doc: defaultValue,
          extensions: [
            history(),
            closeBrackets(),
            autocompletion({ override: [noteLinkCompletionSource(notesRef)] }),
            keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
            markdown(),
            EditorView.lineWrapping,
            livePreviewExtension(knownTitlesRef, onWikilinkClick),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChange(update.state.doc.toString())
            }),
            EditorView.theme({
              '&': { height: '100%', fontSize: '14px', color: 'var(--text-primary)', backgroundColor: 'transparent' },
              '&.cm-focused': { outline: 'none' },
              '.cm-content': { fontFamily: 'var(--font-body)', lineHeight: '1.7', padding: 0 },
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

    useImperativeHandle(ref, () => ({
      insertText(text: string) {
        const view = viewRef.current
        if (!view) return
        view.dispatch(view.state.replaceSelection(text))
        view.focus()
      },
      focus() {
        viewRef.current?.focus()
      }
    }))

    return <div ref={containerRef} style={{ height: '100%', overflow: 'auto' }} />
  }
)
