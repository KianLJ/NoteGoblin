import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'

export interface MarkdownLiveEditorHandle {
  insertText: (text: string) => void
  focus: () => void
}

interface MarkdownLiveEditorProps {
  defaultValue: string
  /** Read via a ref rather than passed by value so a rebuild (triggered by typing/selection, not by this changing) always sees the latest set without needing its own dispatch pipeline. */
  knownTitlesRef: { current: Set<string> }
  onChange: (value: string) => void
  onWikilinkClick: (target: string) => void
}

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function selectionOverlaps(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

/**
 * Obsidian-style "Live Preview": formatting (headers, bold, italic,
 * [[wikilinks]]) renders inline while the document stays a single plain
 * markdown string underneath — the marker characters (`#`, `**`, `[[]]`)
 * are hidden via zero-width replace decorations UNLESS the current
 * selection overlaps that range, in which case the raw syntax shows so you
 * can edit it directly. Rebuilt from the syntax tree (for headers/emphasis)
 * plus a manual wikilink scan (not part of standard markdown, lezer's
 * parser doesn't know about it) on every doc/selection change.
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
      const target = match[1].trim()
      const alias = match[2]?.trim()
      if (selectionOverlaps(state, from, to)) continue
      const labelStart = from + 2 + (alias ? match[1].length + 1 : 0)
      const labelEnd = to - 2
      const resolved = knownTitles.has((alias ?? target).toLowerCase()) || knownTitles.has(target.toLowerCase())
      if (from < labelStart) ranges.push(Decoration.replace({}).range(from, labelStart))
      ranges.push(
        Decoration.mark({
          class: resolved ? 'cm-live-wikilink' : 'cm-live-wikilink cm-live-wikilink--broken',
          attributes: { 'data-wikilink': target }
        }).range(labelStart, labelEnd)
      )
      if (labelEnd < to) ranges.push(Decoration.replace({}).range(labelEnd, to))
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
  return [plugin, clickHandler]
}

export const MarkdownLiveEditor = forwardRef<MarkdownLiveEditorHandle, MarkdownLiveEditorProps>(
  function MarkdownLiveEditor({ defaultValue, knownTitlesRef, onChange, onWikilinkClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    useEffect(() => {
      if (!containerRef.current) return
      const view = new EditorView({
        state: EditorState.create({
          doc: defaultValue,
          extensions: [
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
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
              '.cm-line': { padding: 0 }
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
