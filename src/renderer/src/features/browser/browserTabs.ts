/**
 * The Browser box's tabs, as data: each tab's page (empty for the start page) and title, which one's showing, and
 * the order they were last looked at — the most recent few stay loaded, the rest sleep (see BrowserPanel.tsx).
 */
export interface BrowserTab {
  id: string
  /** The page it's on; '' for the start page. */
  url: string
  title: string
}

export interface TabSet {
  tabs: BrowserTab[]
  active: string
  /** Tab ids, the most recently looked at first. */
  recent: string[]
}

/** Live pages at once: the one showing and the two looked at before it. The rest sleep until opened again. */
export const AWAKE_TABS = 3
const MAX_TABS = 20

const newId = (): string => Math.random().toString(36).slice(2, 10)

export function newTab(url = ''): BrowserTab {
  return { id: newId(), url, title: '' }
}

/** A saved tab set made safe — or a fresh one with a single tab on `fallbackUrl`. */
export function readTabs(raw: unknown, fallbackUrl = ''): TabSet {
  const list = (raw as { tabs?: unknown })?.tabs
  const tabs = Array.isArray(list)
    ? list
        .filter((t): t is BrowserTab => !!t && typeof t.id === 'string' && !!t.id && typeof t.url === 'string')
        .map((t) => ({ id: t.id.slice(0, 32), url: /^https?:\/\//i.test(t.url) ? t.url : '', title: typeof t.title === 'string' ? t.title.slice(0, 200) : '' }))
        .slice(0, MAX_TABS)
    : []
  if (!tabs.length) {
    const one = newTab(fallbackUrl)
    return { tabs: [one], active: one.id, recent: [one.id] }
  }
  const active = tabs.some((t) => t.id === (raw as { active?: unknown }).active) ? ((raw as { active: string }).active) : tabs[0].id
  return { tabs, active, recent: [active, ...tabs.map((t) => t.id).filter((id) => id !== active)] }
}

/** Shows a tab: it's the most recent now. */
export function activate(set: TabSet, id: string): TabSet {
  if (!set.tabs.some((t) => t.id === id)) return set
  return { ...set, active: id, recent: [id, ...set.recent.filter((r) => r !== id)] }
}

/** A new tab — after the one showing — and shows it. */
export function openTab(set: TabSet, url = ''): TabSet {
  if (set.tabs.length >= MAX_TABS) return set
  const tab = newTab(url)
  const at = set.tabs.findIndex((t) => t.id === set.active) + 1
  return activate({ ...set, tabs: [...set.tabs.slice(0, at), tab, ...set.tabs.slice(at)] }, tab.id)
}

/** Closes a tab; closing the one showing shows the one looked at before it. The last tab is never closed — it goes back to the start page instead. */
export function closeTab(set: TabSet, id: string): TabSet {
  if (set.tabs.length <= 1) return { ...set, tabs: set.tabs.map((t) => ({ ...t, url: '', title: '' })) }
  const tabs = set.tabs.filter((t) => t.id !== id)
  const recent = set.recent.filter((r) => r !== id)
  return { tabs, recent, active: set.active === id ? (recent[0] ?? tabs[0].id) : set.active }
}

export function updateTab(set: TabSet, id: string, patch: Partial<Omit<BrowserTab, 'id'>>): TabSet {
  return { ...set, tabs: set.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
}

/** The tabs with a live page: the most recently looked at, up to AWAKE_TABS, that have a page at all. */
export function awakeTabs(set: TabSet): Set<string> {
  const withPage = new Set(set.tabs.filter((t) => t.url || t.id === set.active).map((t) => t.id))
  return new Set(set.recent.filter((id) => withPage.has(id)).slice(0, AWAKE_TABS))
}
