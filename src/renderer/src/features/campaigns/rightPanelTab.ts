/**
 * Shared between RightPanel (DM) and PartySidebar (player) — same tab set
 * (the DM's "Players" and the player's own "Party" are the same conceptual
 * first tab, just labeled differently), persisted under one key so the
 * selected tab survives a DM/player mode switch or an app restart instead
 * of each side tracking its own independently.
 */
export type RightPanelTab = 'players' | 'initiative' | 'dice' | 'calendar'

const STORAGE_KEY = 'gb-right-panel-tab'

export function loadRightPanelTab(): RightPanelTab {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'players' || raw === 'initiative' || raw === 'dice' || raw === 'calendar') return raw
  } catch {
    /* fall through to the default */
  }
  return 'players'
}

export function saveRightPanelTab(tab: RightPanelTab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab)
  } catch {
    /* best-effort persistence only */
  }
}
