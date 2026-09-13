import { describe, expect, it } from 'vitest'
import { dueBadgeView } from './dueBadge'

describe('dueBadgeView', () => {
  it('vira placeholder enquanto a contagem ainda não chegou', () => {
    expect(dueBadgeView(undefined)).toEqual({ kind: 'placeholder' })
  })

  it('fica oculto quando não há nada a revisar', () => {
    expect(dueBadgeView(0)).toEqual({ kind: 'hidden' })
  })

  it('mostra o número quando há algo a revisar', () => {
    expect(dueBadgeView(7)).toEqual({ kind: 'count', text: '7' })
  })

  it('trunca em 99+ acima do teto', () => {
    expect(dueBadgeView(150)).toEqual({ kind: 'count', text: '99+' })
  })

  it('mostra 99 exato sem truncar', () => {
    expect(dueBadgeView(99)).toEqual({ kind: 'count', text: '99' })
  })
})
