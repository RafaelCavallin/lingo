import { describe, expect, it } from 'vitest'
import { INITIAL_PENDING_WINDOW, nextPendingWindow } from './pendingIndicator'

const OPTS = { showDelayMs: 120, minVisibleMs: 300 }

describe('nextPendingWindow', () => {
  it('uma resposta em 50ms nunca fica visível', () => {
    const r1 = nextPendingWindow(INITIAL_PENDING_WINDOW, true, 0, OPTS)
    expect(r1.visible).toBe(false)
    expect(r1.nextCheckInMs).toBe(120)

    const r2 = nextPendingWindow(
      { pendingSince: r1.pendingSince, shownAt: r1.shownAt },
      false,
      50,
      OPTS,
    )
    expect(r2.visible).toBe(false)
    expect(r2.pendingSince).toBeNull()
  })

  it('uma resposta em 500ms fica visível e permanece pelo mínimo', () => {
    const r1 = nextPendingWindow(INITIAL_PENDING_WINDOW, true, 0, OPTS)
    const r2 = nextPendingWindow({ pendingSince: r1.pendingSince, shownAt: null }, true, 120, OPTS)
    expect(r2.visible).toBe(true)
    expect(r2.shownAt).toBe(120)

    // A chamada termina em 150ms — antes do mínimo de exibição (300ms).
    const r3 = nextPendingWindow({ pendingSince: null, shownAt: r2.shownAt }, false, 150, OPTS)
    expect(r3.visible).toBe(true)
    expect(r3.nextCheckInMs).toBe(270)

    const r4 = nextPendingWindow({ pendingSince: null, shownAt: r3.shownAt }, false, 420, OPTS)
    expect(r4.visible).toBe(false)
  })

  it('é determinístico: mesma entrada, mesma saída', () => {
    const state = { pendingSince: 10, shownAt: null }
    expect(nextPendingWindow(state, true, 200, OPTS)).toEqual(nextPendingWindow(state, true, 200, OPTS))
  })
})
