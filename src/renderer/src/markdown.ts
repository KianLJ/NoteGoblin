import { Marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { WIKILINK_PATTERN, wikilinkAlias, wikilinkTarget } from './wikilink'

/** A minimal Obsidian-style wikilink token — `[[Target]]`/`[[Target|Alias]]` or `[Target]`/`[Target|Alias]`. */
interface WikilinkToken extends Tokens.Generic {
  type: 'wikilink'
  target: string
  alias?: string
}

const WIKILINK_START_RE = /\[/
const WIKILINK_TOKEN_RE = new RegExp(`^(?:${WIKILINK_PATTERN})`)

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Renders note markdown to sanitized HTML — GFM (tables, strikethrough,
 * etc.) via marked, plus a custom wikilink extension (not part of standard
 * markdown or marked's GFM support, so it's hand-rolled as a marked inline
 * extension) recognizing both `[[Note Title]]`/`[[Title|Alias]]` and the
 * lighter `[Note Title]`/`[Title|Alias]` form — see wikilink.ts for how the
 * single-bracket form avoids colliding with real markdown links. Resolved
 * links (title found in `knownTitles`, case-insensitive) and broken ones
 * get different classes so the preview can show which links actually go
 * somewhere; navigation itself is handled by the caller via a
 * `data-wikilink` attribute and click delegation, since these render as
 * plain anchors inside `dangerouslySetInnerHTML`, not real React elements.
 *
 * A fresh `Marked` instance is used per call (rather than the shared
 * default export) so the wikilink extension's `knownTitles` closure never
 * leaks between notes.
 */
export function renderNoteMarkdown(source: string, knownTitles: Set<string>): string {
  try {
    const instance = new Marked({ gfm: true, breaks: true })

    instance.use({
      extensions: [
        {
          name: 'wikilink',
          level: 'inline',
          start(src: string): number | undefined {
            const idx = src.search(WIKILINK_START_RE)
            return idx === -1 ? undefined : idx
          },
          tokenizer(src: string): WikilinkToken | undefined {
            const match = WIKILINK_TOKEN_RE.exec(src)
            if (!match) return undefined
            const target = wikilinkTarget(match)
            if (!target) return undefined
            return {
              type: 'wikilink',
              raw: match[0],
              target,
              alias: wikilinkAlias(match)
            }
          },
          renderer(token: Tokens.Generic): string {
            const { target, alias } = token as WikilinkToken
            const resolved = knownTitles.has(target.toLowerCase())
            const label = escapeHtml(alias ?? target)
            const cls = resolved ? 'gb-wikilink' : 'gb-wikilink gb-wikilink--broken'
            return `<a href="#" class="${cls}" data-wikilink="${escapeHtml(target)}">${label}</a>`
          }
        }
      ]
    })

    const html = instance.parse(source, { async: false }) as string
    const sanitize = (DOMPurify as unknown as { sanitize?: typeof DOMPurify.sanitize }).sanitize
    if (typeof sanitize !== 'function') {
      // DOMPurify couldn't find a DOM to bind to in this environment — fail
      // safe by showing the escaped raw source rather than injecting
      // unsanitized HTML or silently rendering nothing.
      console.error('DOMPurify.sanitize is unavailable; rendering markdown as plain text.')
      return `<pre>${escapeHtml(source)}</pre>`
    }
    return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wikilink'], ALLOW_DATA_ATTR: true })
  } catch (err) {
    console.error('Markdown rendering failed:', err)
    return `<pre>${escapeHtml(source)}</pre>`
  }
}
