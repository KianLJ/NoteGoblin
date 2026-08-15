/**
 * Shared match pattern for note links — both the Obsidian-style
 * `[[Double Bracket]]` form and a lighter `[Single Bracket]` form. Used by
 * both the Preview renderer (markdown.ts) and the live editor's inline
 * decorations (MarkdownLiveEditor.tsx) so the two never drift apart on what
 * counts as a link.
 *
 * Group 1/2 are target/alias for the `[[double]]` form. Group 3/4 are
 * target/alias for the `[single]` form.
 *
 * The single-bracket form only matches when it can't be anything else:
 * - `(?<!\])` before the opening `[` — so the *second* half of a reference
 *   link `[text][ref]` (i.e. `[ref]`, which looks exactly like a valid
 *   wikilink in isolation once `[text]` itself is rejected) doesn't match
 *   just because it directly follows a `]`.
 * - `(?!\[)` right after the opening `[` — so it doesn't fire on the first
 *   `[` of a `[[double]]` pair.
 * - the content excludes `(`, `)`, `[` — so it can't accidentally swallow
 *   real link syntax.
 * - `(?!\(|\[)` right after the closing `]` — so a real markdown link
 *   `[text](url)` or reference link `[text][ref]` is left alone entirely
 *   (and falls through to normal link parsing).
 */
export const WIKILINK_PATTERN =
  '\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]|(?<!\\])\\[(?!\\[)([^\\]|()\\[]+)(?:\\|([^\\]]+))?\\](?!\\(|\\[)'

export function wikilinkTarget(match: RegExpExecArray): string {
  return (match[1] ?? match[3]).trim()
}

export function wikilinkAlias(match: RegExpExecArray): string | undefined {
  const raw = match[2] ?? match[4]
  return raw?.trim()
}

/** True if the `[[double]]` alternative matched (vs `[single]`) — tells the caller how many marker characters sit on each side. */
export function wikilinkIsDouble(match: RegExpExecArray): boolean {
  return match[1] !== undefined
}
