const ABSOLUTE_RE = /^(data:|[a-z][a-z0-9+.-]*:\/\/|\/)/i

/**
 * Local, relative image references — `![art](images/dragon.png)`, a real
 * file someone dropped into the campaign's vault folder rather than a
 * pasted/embedded `data:` image — get rewritten to the `vault-asset://`
 * protocol (registered in main/index.ts) so they resolve to the actual file
 * on disk. No-op for anything already absolute (`data:` URIs, `http(s)://`,
 * or a leading `/`).
 *
 * Only ever resolves on the machine that actually has the vault — a player
 * connected over the relay sees the note's markdown text same as always,
 * but a relative image reference only renders for whoever's local vault
 * actually contains that file (normally just the DM). That's an inherent
 * limit of vault storage being local-only, not something this rewrite can
 * paper over.
 */
export function resolveImageSrc(campaignId: string, src: string): string {
  if (ABSOLUTE_RE.test(src)) return src
  const encodedPath = src
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `vault-asset://${campaignId}/${encodedPath}`
}
