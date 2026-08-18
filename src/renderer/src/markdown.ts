import { Marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { WIKILINK_PATTERN, wikilinkAlias, wikilinkTarget } from './wikilink'
import { resolveImageSrc } from './imageSrc'
import { parseStatblock, renderStatblockHtml } from './statblock'

/** A minimal Obsidian-style wikilink token — `[[Target]]`/`[[Target|Alias]]` or `[Target]`/`[Target|Alias]`. */
interface WikilinkToken extends Tokens.Generic {
  type: 'wikilink'
  target: string
  alias?: string
}

const WIKILINK_START_RE = /\[/
const WIKILINK_TOKEN_RE = new RegExp(`^(?:${WIKILINK_PATTERN})`)

const EMBED_IMAGE_START_RE = /!\[\[/
const EMBED_IMAGE_TOKEN_RE = /^!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/
const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|gif|svg|webp|bmp)$/i

interface EmbedImageToken extends Tokens.Generic {
  type: 'embedImage'
  target: string
  alt: string
}

export function escapeHtml(value: string): string {
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
export function renderNoteMarkdown(source: string, knownTitles: Set<string>, campaignId: string): string {
  try {
    const instance = new Marked({ gfm: true, breaks: true })

    instance.use({
      renderer: {
        // Rewrites a relative image src (a real file in the vault, not a
        // pasted data: URI) to vault-asset:// so it actually resolves — see
        // resolveImageSrc for why this only ever works for whoever has the
        // vault locally.
        image({ href, title, text }: Tokens.Image): string {
          const src = escapeHtml(resolveImageSrc(campaignId, href))
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
          return `<img src="${src}" alt="${escapeHtml(text)}"${titleAttr}>`
        },
        // A ```statblock fenced block renders as a formatted D&D stat block
        // card (see statblock.ts) instead of a plain code block — anything
        // else falls back to the same bare <pre><code> marked's own default
        // renderer would produce.
        code({ text, lang }: Tokens.Code): string {
          if ((lang ?? '').trim().toLowerCase() === 'statblock') {
            return renderStatblockHtml(parseStatblock(text))
          }
          const langName = (lang ?? '').trim().split(/\s+/)[0]
          const langClass = langName ? ` class="language-${escapeHtml(langName)}"` : ''
          return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>`
        }
      },
      extensions: [
        {
          // Obsidian's embed syntax — `![[image.png]]` — otherwise falls
          // through to the wikilink extension below (which only sees
          // `[[image.png]]`, the `!` doesn't stop it from matching) and
          // renders as a broken link to a note literally titled "image.png"
          // instead of the image. Only claims it when the target actually
          // looks like an image file; `![[Some Note]]` (Obsidian's note
          // transclusion) isn't implemented, so that still falls through to
          // the ordinary wikilink rendering same as before.
          name: 'embedImage',
          level: 'inline',
          start(src: string): number | undefined {
            const idx = src.search(EMBED_IMAGE_START_RE)
            return idx === -1 ? undefined : idx
          },
          tokenizer(src: string): EmbedImageToken | undefined {
            const match = EMBED_IMAGE_TOKEN_RE.exec(src)
            if (!match) return undefined
            const target = match[1].trim()
            if (!IMAGE_EXTENSION_RE.test(target)) return undefined
            return { type: 'embedImage', raw: match[0], target, alt: (match[2]?.trim() || target) }
          },
          renderer(token: Tokens.Generic): string {
            const { target, alt } = token as EmbedImageToken
            const src = escapeHtml(resolveImageSrc(campaignId, target))
            return `<img src="${src}" alt="${escapeHtml(alt)}">`
          }
        },
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
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-wikilink'],
      ALLOW_DATA_ATTR: true,
      // DOMPurify's default URI allowlist doesn't know about vault-asset: —
      // extend it (default schemes + vault-asset) rather than dropping the
      // allowlist entirely, so a vault-referenced image's src survives
      // sanitization instead of getting silently stripped.
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|vault-asset|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
    })
  } catch (err) {
    console.error('Markdown rendering failed:', err)
    return `<pre>${escapeHtml(source)}</pre>`
  }
}
