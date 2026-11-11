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

/** Every note title a body links to, lowercased (links resolve by title, ignoring case — see markdown.ts). */
export function linkTargets(body: string): Set<string> {
  const targets = new Set<string>()
  const re = new RegExp(WIKILINK_PATTERN, 'g')
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const target = wikilinkTarget(m).toLowerCase()
    if (target) targets.add(target)
  }
  return targets
}

/** The other notes that link to `note` by its title — its backlinks, sorted by title. */
export function backlinksTo<T extends { id: string; title: string; bodyMarkdown: string }>(notes: T[], note: { id: string; title: string }): T[] {
  const title = note.title.trim().toLowerCase()
  if (!title) return []
  return notes.filter((n) => n.id !== note.id && linkTargets(n.bodyMarkdown).has(title)).sort((a, b) => a.title.localeCompare(b.title))
}

/** True if the `[[double]]` alternative matched (vs `[single]`) — tells the caller how many marker characters sit on each side. */
export function wikilinkIsDouble(match: RegExpExecArray): boolean {
  return match[1] !== undefined
}
