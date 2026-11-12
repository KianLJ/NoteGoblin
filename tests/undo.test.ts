import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissUndo, offerUndo, undoLast, whenFinal } from '../src/renderer/src/ui/undo'

describe('undo after deleting', () => {
  afterEach(() => vi.useRealTimers())

  it('puts it back, and skips what was waiting to be final', () => {
    const undone = vi.fn()
    const final = vi.fn()
    offerUndo('Deleted a quest', undone)
    whenFinal(final)
    undoLast()
    expect(undone).toHaveBeenCalledOnce()
    expect(final).not.toHaveBeenCalled()
  })

  it('makes it final when the time runs out, or a newer deletion comes', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    offerUndo('one', () => {})
    whenFinal(first)
    offerUndo('two', () => {})
    expect(first).toHaveBeenCalledOnce()
    const second = vi.fn()
    whenFinal(second)
    vi.advanceTimersByTime(8000)
    expect(second).toHaveBeenCalledOnce()
    const now = vi.fn()
    whenFinal(now)
    expect(now).toHaveBeenCalledOnce()
    dismissUndo()
  })
})
