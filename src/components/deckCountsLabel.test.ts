import { describe, expect, it } from 'vitest'
import { deckCountsLabel } from './deckCountsLabel'

describe('deckCountsLabel', () => {
  it('avisa quando o baralho está vazio', () => {
    expect(deckCountsLabel({ total: 0, fresh: 0, learning: 0, review: 0 })).toBe('Nenhum cartão')
  })

  it('usa o singular com um cartão novo', () => {
    expect(deckCountsLabel({ total: 1, fresh: 1, learning: 0, review: 0 })).toBe('1 cartão · 1 novo')
  })

  it('mostra todas as partes quando há de cada estado', () => {
    expect(deckCountsLabel({ total: 42, fresh: 10, learning: 5, review: 27 })).toBe(
      '42 cartões · 10 novos · 5 aprendendo · 27 em revisão',
    )
  })

  it('omite as partes zeradas', () => {
    expect(deckCountsLabel({ total: 3, fresh: 0, learning: 0, review: 3 })).toBe('3 cartões · 3 em revisão')
  })
})
