/** Things whose name matches `query`, best first: names starting with it, then a word starting with it, then anywhere in it. An empty query keeps everything as it was. */
export function rankByName<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const score = (name: string): number => (name.startsWith(q) ? 0 : name.split(/[\s(,-]+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : 3)
  return items
    .map((item) => ({ item, s: score(item.name.toLowerCase()) }))
    .filter((x) => x.s < 3)
    .sort((a, b) => a.s - b.s || a.item.name.localeCompare(b.item.name))
    .map((x) => x.item)
}
