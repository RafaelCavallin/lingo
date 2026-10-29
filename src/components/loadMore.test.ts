import { describe, expect, it } from 'vitest'
import { CARDS_PAGE_SIZE, loadMoreButtonText, loadMoreLabel, nextVisibleCount } from './loadMore'

describe('nextVisibleCount', () => {
  it('soma um lote inteiro quando ainda há cartões de sobra', () => {
    const visible = nextVisibleCount({ visible: 100, total: 1000, step: CARDS_PAGE_SIZE })
    expect(visible).toBe(200)
  })

  it('para no total quando o último lote é parcial', () => {
    const visible = nextVisibleCount({ visible: 200, total: 240, step: CARDS_PAGE_SIZE })
    expect(visible).toBe(240)
  })

  it('não passa do total quando tudo já está visível', () => {
    const visible = nextVisibleCount({ visible: 240, total: 240, step: CARDS_PAGE_SIZE })
    expect(visible).toBe(240)
  })
})

describe('loadMoreLabel', () => {
  it('mostra quantos cartões estão na tela com separador de milhar', () => {
    expect(loadMoreLabel({ shown: 100, total: 1940 })).toBe('Mostrando 100 de 1.940')
  })

  it('não mostra mais do que o total quando a lista encolhe', () => {
    expect(loadMoreLabel({ shown: 100, total: 42 })).toBe('Mostrando 42 de 42')
  })
})

describe('loadMoreButtonText', () => {
  it('anuncia um lote cheio enquanto há cartões de sobra', () => {
    expect(loadMoreButtonText({ shown: 100, total: 1940 })).toBe('Carregar mais 100')
  })

  it('anuncia só o que falta no último lote', () => {
    expect(loadMoreButtonText({ shown: 200, total: 240 })).toBe('Carregar mais 40')
  })
})
