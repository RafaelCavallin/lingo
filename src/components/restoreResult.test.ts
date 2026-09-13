import { describe, expect, it } from 'vitest'
import { nothingApplied } from './restoreResult'

describe('nothingApplied', () => {
  it('é verdadeiro quando registros e áudio estão zerados', () => {
    expect(nothingApplied({ decks: 0, cards: 0, reviewLogs: 0, audio: 0 })).toBe(true)
  })

  it('é falso quando só o áudio foi aplicado', () => {
    expect(nothingApplied({ decks: 0, cards: 0, reviewLogs: 0, audio: 3 })).toBe(false)
  })

  it('é falso quando algum registro foi aplicado', () => {
    expect(nothingApplied({ decks: 1, cards: 0, reviewLogs: 0, audio: 0 })).toBe(false)
  })
})
