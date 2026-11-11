/**
 * The Browser box's own session — its pages' cookies, logins and storage, kept apart from the app's — one per
 * NoteGoblin account, so whoever signs in on this computer gets their own logins. Signed out: a shared one.
 */
export function browserPartition(accountId: string | null): string {
  const id = (accountId ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return id ? `persist:browser-${id}` : 'persist:browser'
}

/** A partition the Browser box may use — and nothing else may put a page in. */
export function isBrowserPartition(partition: string): boolean {
  return /^persist:browser(-[A-Za-z0-9_-]{1,64})?$/.test(partition)
}

/** A page the Browser box may show: http or https, nothing else. */
export function isBrowsableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * What was typed in the address bar, as a page to open: a web address as it is (https:// added if it has none),
 * anything else searched for.
 */
export function addressToUrl(typed: string, searchUrl = 'https://duckduckgo.com/?q='): string {
  const text = typed.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return isBrowsableUrl(text) ? text : searchUrl + encodeURIComponent(text)
  // A word with a dot and no spaces, or localhost: an address. "dnd beyond" or "fireball 5e": a search.
  if (!/\s/.test(text) && (/^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text) || /^localhost(:\d+)?(\/.*)?$/i.test(text))) {
    const url = `https://${text}`
    if (isBrowsableUrl(url)) return url
  }
  return searchUrl + encodeURIComponent(text)
}
