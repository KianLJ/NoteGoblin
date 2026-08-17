/**
 * A minimal, hand-rolled reader/writer for the flat YAML frontmatter block
 * every note file carries — not a general YAML parser, just enough to
 * round-trip our own known fields (id/authorUserId/editorUserIds/timestamps)
 * while still being real `---\n...\n---` YAML so the file opens cleanly in
 * Obsidian (or any other frontmatter-aware editor) with a readable
 * Properties panel, not a foreign JSON blob. Pulling in a real YAML library
 * for five flat fields felt like more risk (another dependency touched from
 * the main process) than it was worth.
 */
export interface NoteFrontmatter {
  id: string
  authorUserId: string
  editorUserIds: string[]
  createdAt: string
  updatedAt: string
}

const OPEN = '---\n'
const CLOSE_MARKER = '\n---\n'

export function serializeNote(fm: NoteFrontmatter, body: string): string {
  const block = [
    `id: ${fm.id}`,
    `authorUserId: ${fm.authorUserId}`,
    `editorUserIds: [${fm.editorUserIds.join(', ')}]`,
    `createdAt: ${fm.createdAt}`,
    `updatedAt: ${fm.updatedAt}`
  ].join('\n')
  return `${OPEN}${block}${CLOSE_MARKER}${body}`
}

export function parseNote(raw: string): { frontmatter: NoteFrontmatter; body: string } | null {
  if (!raw.startsWith(OPEN)) return null
  const closeIdx = raw.indexOf(CLOSE_MARKER, OPEN.length)
  if (closeIdx === -1) return null
  const block = raw.slice(OPEN.length, closeIdx)
  const body = raw.slice(closeIdx + CLOSE_MARKER.length)

  const fields: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const match = /^(\w+):\s*(.*)$/.exec(line)
    if (match) fields[match[1]] = match[2]
  }
  if (!fields.id || !fields.authorUserId) return null

  const now = new Date().toISOString()
  const editorUserIds = (fields.editorUserIds ?? '[]')
    .trim()
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    frontmatter: {
      id: fields.id,
      authorUserId: fields.authorUserId,
      editorUserIds,
      createdAt: fields.createdAt ?? now,
      updatedAt: fields.updatedAt ?? fields.createdAt ?? now
    },
    body
  }
}
