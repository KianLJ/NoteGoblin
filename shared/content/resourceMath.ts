// Spending and refilling engine resources on the sheet — shared by the
// Actions tab, the Features tab and the rest buttons so every place spends
// temporary points first and refills the same way.

import type { DerivedResource, DerivedRestore } from './engine'

export interface ResourceState {
  resourceUsed: Record<string, number>
  resourceTemp: Record<string, number>
}

/** The temp map with this resource's temporary points set — the entry goes away entirely once they're all spent. */
function withTemp(temps: Record<string, number>, id: string, n: number): Record<string, number> {
  const next = { ...temps }
  if (n > 0) next[id] = n
  else delete next[id]
  return next
}

/** Points left in a resource, temporary ones included. */
export function resourceRemaining(resource: DerivedResource, state: ResourceState): number {
  const used = Math.min(state.resourceUsed[resource.id] ?? 0, resource.max)
  return resource.max - used + Math.max(0, state.resourceTemp[resource.id] ?? 0)
}

/** Spends `amount` (temporary points first); null when there isn't enough. */
export function spendResource(resource: DerivedResource, state: ResourceState, amount: number): ResourceState | null {
  if (amount <= 0) return state
  if (resourceRemaining(resource, state) < amount) return null
  const temp = Math.max(0, state.resourceTemp[resource.id] ?? 0)
  const fromTemp = Math.min(temp, amount)
  const used = Math.min(state.resourceUsed[resource.id] ?? 0, resource.max) + (amount - fromTemp)
  return {
    resourceUsed: { ...state.resourceUsed, [resource.id]: used },
    resourceTemp: withTemp(state.resourceTemp, resource.id, temp - fromTemp)
  }
}

/** Rolls a formatted dice amount ("2d6 + 3", "1d4", "5"). */
export function rollAmount(amount: string, random: () => number = Math.random): number {
  let total = 0
  const terms = amount.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? []
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1
    const body = term.replace(/^[+-]/, '')
    const dice = body.match(/^(\d*)d(\d+)$/)
    if (dice) {
      const count = Number(dice[1] || 1)
      const sides = Number(dice[2])
      for (let i = 0; i < count; i++) total += sign * (1 + Math.floor(random() * sides))
    } else if (Number.isFinite(Number(body))) {
      total += sign * Number(body)
    }
  }
  return total
}

/** Applies an action's restores: refills spent points, or adds temporary ones. Returns the new state and what each restore gave. */
export function applyRestores(
  restores: DerivedRestore[],
  resources: DerivedResource[],
  state: ResourceState,
  random: () => number = Math.random
): { state: ResourceState; gained: { resourceId: string; amount: number; temporary: boolean }[] } {
  let next = state
  const gained: { resourceId: string; amount: number; temporary: boolean }[] = []
  for (const r of restores) {
    const resource = resources.find((x) => x.id === r.resourceId)
    if (!resource) continue
    const amount = Math.max(0, r.value ?? rollAmount(r.amount, random))
    if (r.temporary) {
      next = { ...next, resourceTemp: withTemp(next.resourceTemp, r.resourceId, Math.max(0, next.resourceTemp[r.resourceId] ?? 0) + amount) }
    } else {
      const used = Math.min(next.resourceUsed[r.resourceId] ?? 0, resource.max)
      next = { ...next, resourceUsed: { ...next.resourceUsed, [r.resourceId]: Math.max(0, used - amount) } }
    }
    gained.push({ resourceId: r.resourceId, amount, temporary: !!r.temporary })
  }
  return { state: next, gained }
}

/** What a rest does to engine resources: a short rest refills short-rest ones and gives back each long-rest resource's shortRestRegain; temporary points always go. */
export function restResources(kind: 'short' | 'long', resources: DerivedResource[], state: ResourceState): ResourceState {
  const resourceUsed = { ...state.resourceUsed }
  for (const r of resources) {
    const refills = (kind === 'long' ? ['short', 'long', 'dawn'] : ['short']).includes(r.recharge)
    if (refills) resourceUsed[r.id] = 0
    else if (kind === 'short' && r.shortRestRegain) resourceUsed[r.id] = Math.max(0, (resourceUsed[r.id] ?? 0) - r.shortRestRegain)
  }
  // Any rest clears temporary points.
  return { resourceUsed, resourceTemp: {} }
}

/** Gives back up to `amount` spent points (never above the maximum; temporary points are untouched). */
export function restoreResource(resource: DerivedResource, state: ResourceState, amount: number): ResourceState {
  const used = Math.min(state.resourceUsed[resource.id] ?? 0, resource.max)
  return { ...state, resourceUsed: { ...state.resourceUsed, [resource.id]: Math.max(0, used - Math.max(0, amount)) } }
}

/** Sets how many regular points are used (a uses-box click), leaving temporary points as they are. */
export function setResourceUsed(resource: DerivedResource, state: ResourceState, used: number): ResourceState {
  return { ...state, resourceUsed: { ...state.resourceUsed, [resource.id]: Math.max(0, Math.min(resource.max, used)) } }
}

/** Removes `amount` temporary points (all of them when omitted). */
export function removeTempPoints(resource: DerivedResource, state: ResourceState, amount?: number): ResourceState {
  const temp = Math.max(0, state.resourceTemp[resource.id] ?? 0)
  const next = amount === undefined ? 0 : Math.max(0, temp - amount)
  return { ...state, resourceTemp: withTemp(state.resourceTemp, resource.id, next) }
}
