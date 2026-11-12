import { describe, expect, it } from 'vitest'
import { routeWidths, niceLength, coverAt, distanceBetween, parseAmount, orbitThrough, pinPositionsAt, type MapPoint, EMPTY_WORLD_MAP, formatDistance, mapsForPlayer, trailDistance, moveParty, normalizeMaps, normalizeWorldMap, placeParty, trailLines, worldMapForPlayer } from '../shared/worldMap'

describe('the world map', () => {
  it('reads back only what makes sense, positions kept on the picture', () => {
    const m = normalizeWorldMap({
      imageId: 'abc',
      aspect: 1.6,
      pins: [
        { id: 'a', x: 1.4, y: 0.2, label: ' Cinderhold ', kind: 'note', ref: 'Cinderhold', color: '#nope', shared: true },
        { id: 'b', x: 'west', y: 0.3 },
        { id: 'c', x: 0.5, y: 0.5, kind: 'place', ref: 'ignored' }
      ],
      party: { x: 0.4, y: 0.6 },
      trail: [{ x: 0.1, y: 0.1 }, 'junk'],
      revealed: [{ x: 0.5, y: 0.5, r: 0.1 }, { x: 0.5, y: 0.5, r: 0 }],
      fog: true
    })
    expect(m.pins).toEqual([
      { id: 'a', x: 1, y: 0.2, label: 'Cinderhold', kind: 'note', ref: 'Cinderhold', color: '#c0533a', shared: true },
      { id: 'c', x: 0.5, y: 0.5, label: '', kind: 'place', color: '#c0533a', shared: false }
    ])
    expect(m.trail).toEqual([{ x: 0.1, y: 0.1 }])
    expect(m.revealed).toEqual([{ x: 0.5, y: 0.5, r: 0.1 }])
    expect(normalizeWorldMap(null)).toEqual(EMPTY_WORLD_MAP)
  })

  it('moves the party, leaving a trail, but not for a nudge in place', () => {
    let m = moveParty(EMPTY_WORLD_MAP, { x: 0.2, y: 0.2 })
    m = moveParty(m, { x: 0.3, y: 0.25 })
    m = moveParty(m, { x: 0.3001, y: 0.25 })
    expect(m.party).toEqual({ x: 0.3001, y: 0.25 })
    expect(m.trail).toHaveLength(2)
  })

  it('covers up the revealed circles under a point', () => {
    const m = { ...EMPTY_WORLD_MAP, revealed: [{ x: 0.5, y: 0.5, r: 0.1 }, { x: 0.9, y: 0.9, r: 0.05 }] }
    expect(coverAt(m, { x: 0.52, y: 0.5 }, 1.5).revealed).toEqual([{ x: 0.9, y: 0.9, r: 0.05 }])
  })

  it('gives a player only the shown pins', () => {
    const m = normalizeWorldMap({ pins: [{ id: 'a', x: 0, y: 0, shared: true }, { id: 'b', x: 0, y: 0 }] })
    expect(worldMapForPlayer(m).pins.map((p) => p.id)).toEqual(['a'])
  })

  it('sets the party down without walking them: their old trail stays, and a new stretch starts', () => {
    let m = moveParty(EMPTY_WORLD_MAP, { x: 0.1, y: 0.1 })
    m = moveParty(m, { x: 0.2, y: 0.1 })
    m = placeParty(m, { x: 0.8, y: 0.8 })
    m = moveParty(m, { x: 0.9, y: 0.8 })
    expect(m.party).toEqual({ x: 0.9, y: 0.8 })
    expect(trailLines(m.trail)).toEqual([
      [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }],
      [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.8 }]
    ])
  })

  it('keeps several maps, each with its own id, and gives a player only the shown ones', () => {
    const doc = normalizeMaps({ maps: [{ id: 'w', name: 'The World', shared: true, pins: [{ id: 'a', x: 0, y: 0, shared: true }, { id: 'b', x: 0, y: 0 }] }, { id: 'w', name: 'Twin' }, { id: 'c', name: 'Cinderhold' }] })
    expect(doc.maps.map((m) => m.name)).toEqual(['The World', 'Cinderhold'])
    const seen = mapsForPlayer(doc).maps
    expect(seen.map((m) => m.name)).toEqual(['The World'])
    expect(seen[0].pins.map((p) => p.id)).toEqual(['a'])
  })

  it('measures distances on the map in any unit, the trail without its jumps', () => {
    const map = normalizeWorldMap({ aspect: 2, scale: { across: 100, unit: ' km ' } })
    expect(map.scale).toEqual({ across: 100, unit: 'km' })
    // Across half the width, then down half the height (half of 50 km).
    expect(distanceBetween(map, { x: 0, y: 0 }, { x: 0.5, y: 0 })).toBe(50)
    expect(distanceBetween(map, { x: 0, y: 0 }, { x: 0, y: 0.5 })).toBe(25)
    let m = moveParty(map, { x: 0, y: 0 })
    m = moveParty(m, { x: 0.3, y: 0 })
    m = placeParty(m, { x: 0.9, y: 0.9 })
    m = moveParty(m, { x: 0.9, y: 0.5 })
    expect(trailDistance(m)).toBeCloseTo(30 + 20)
    expect(formatDistance(1204.4, 'mi')).toBe('1,204 mi')
    expect(formatDistance(12.44, 'km')).toBe('12.4 km')
    expect(distanceBetween(normalizeWorldMap({}), { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull()
    expect(normalizeWorldMap({ scale: { across: -5, unit: 'km' } }).scale).toBeUndefined()
  })

  it('measures a solar system as well as a street, and reads the size however it is typed', () => {
    expect(['300', '1,500', '18.6 trillion', '18.6t', '4.5 Billion', '1.86e13', '0.5'].map(parseAmount)).toEqual([300, 1500, 18.6e12, 18.6e12, 4.5e9, 1.86e13, 0.5])
    expect(['', 'lots', '-5', '3 zillion'].map(parseAmount)).toEqual([null, null, null, null])
    const sol = normalizeWorldMap({ aspect: 1, scale: { across: 18.6e12, unit: 'mi' } })
    expect(sol.scale?.across).toBe(18.6e12)
    expect(formatDistance(distanceBetween(sol, { x: 0, y: 0 }, { x: 0.5, y: 0 })!, 'mi')).toBe('9.3 trillion mi')
    expect(formatDistance(2_500_000, 'km')).toBe('2.5 million km')
    expect(formatDistance(0.0042, 'mm')).toBe('0.0042 mm')
  })

  it('sets a scale from a measured line, and picks round lengths for a scale bar', () => {
    // Half the width across a 2:1 map: 0.5 widths; so 93 million miles there makes it 186 million across.
    expect(routeWidths({ aspect: 2 }, [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }])).toBeCloseTo(0.5)
    expect(routeWidths({ aspect: 2 }, [{ x: 0, y: 0 }, { x: 0, y: 1 }])).toBeCloseTo(0.5)
    expect([0.9, 1.4, 2.6, 4, 8, 130, 3.2e12].map(niceLength)).toEqual([1, 1, 2, 5, 10, 100, 2e12])
  })

  it('moves orbiting pins with the calendar, moons following their planets', () => {
    const base = normalizeWorldMap({ aspect: 1, pins: [{ id: 'sun', x: 0.5, y: 0.5 }, { id: 'earth', x: 0.7, y: 0.5 }, { id: 'moon', x: 0.75, y: 0.5 }] })
    const earth = orbitThrough(base, 'sun', { x: 0.7, y: 0.5 }, 0, 365)!
    const withEarth = { ...base, pins: base.pins.map((p) => (p.id === 'earth' ? { ...p, orbit: earth } : p)) }
    const moon = orbitThrough(withEarth, 'earth', { x: 0.75, y: 0.5 }, 0, 28)!
    const map = normalizeWorldMap({ ...withEarth, pins: withEarth.pins.map((p) => (p.id === 'moon' ? { ...p, orbit: moon } : p)) })
    const at = (day: number, id: string): MapPoint => pinPositionsAt(map, day).get(id)!
    expect(at(0, 'earth').x).toBeCloseTo(0.7)
    // A quarter of a year on, anticlockwise: above the sun (y smaller).
    expect(at(365 / 4, 'earth').x).toBeCloseTo(0.5)
    expect(at(365 / 4, 'earth').y).toBeCloseTo(0.3)
    // The moon is still 0.05 from the earth, wherever the earth has got to.
    const e = at(100, 'earth')
    const m = at(100, 'moon')
    expect(Math.hypot(m.x - e.x, m.y - e.y)).toBeCloseTo(0.05)
    // A whole year later, back where it started.
    expect(at(365, 'earth').x).toBeCloseTo(0.7)
    // A pin can't go round itself, and a loop leaves pins where they were put.
    expect(normalizeWorldMap({ pins: [{ id: 'a', x: 0.1, y: 0.1, orbit: { around: 'a', radius: 0.1, period: 10, phase: 0 } }] }).pins[0].orbit).toBeUndefined()
    const loop = normalizeWorldMap({ aspect: 1, pins: [{ id: 'a', x: 0.1, y: 0.1, orbit: { around: 'b', radius: 0.1, period: 10, phase: 0 } }, { id: 'b', x: 0.2, y: 0.2, orbit: { around: 'a', radius: 0.1, period: 10, phase: 0 } }] })
    expect(pinPositionsAt(loop, 3).size).toBe(2)
    // Locked orbits stay locked when saved.
    expect(normalizeWorldMap({ pins: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0, orbit: { around: 'a', radius: 0.1, period: 10, phase: 0, locked: true } }] }).pins[1].orbit?.locked).toBe(true)
    // Any #rrggbb colour is kept.
    expect(normalizeWorldMap({ pins: [{ id: 'a', x: 0, y: 0, color: '#12AB9f' }] }).pins[0].color).toBe('#12ab9f')
    // A sphere's size is kept if it makes sense.
    expect(normalizeWorldMap({ pins: [{ id: 'a', x: 0, y: 0, size: 0.03 }, { id: 'b', x: 0, y: 0, size: 9 }] }).pins.map((p) => p.size)).toEqual([0.03, undefined])
  })
})
