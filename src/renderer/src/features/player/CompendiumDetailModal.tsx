/** A labeled stat-block row (e.g. { label: 'Casting Time', value: '1 action' }) — shared by HoverDetailCard and the three tabs that build field lists for compendium/custom attacks, spells, and items. */
export interface DetailField {
  label: string
  value: string
}
