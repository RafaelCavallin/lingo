import { describe, expect, it } from 'vitest'
import { progressMeter } from './progressBar'

describe('progressMeter', () => {
  it('fica indeterminado quando o total é nulo', () => {
    const m = progressMeter({ label: 'Restaurando…', done: 0, total: null })
    expect(m.determinate).toBe(false)
    expect(m.ariaValueNow).toBeNull()
    expect(m.counter).toBeNull()
    expect(m.ariaValueText).toBe('Restaurando…')
  })

  it('fica indeterminado quando o total é zero', () => {
    expect(progressMeter({ label: 'x', done: 0, total: 0 }).determinate).toBe(false)
  })

  it('fica indeterminado quando o feito é nulo', () => {
    expect(progressMeter({ label: 'x', done: null, total: 10 }).determinate).toBe(false)
  })

  it('calcula a porcentagem e o contador quando determinado', () => {
    const m = progressMeter({ label: 'x', done: 30, total: 120 })
    expect(m.determinate).toBe(true)
    expect(m.pct).toBe(25)
    expect(m.counter).toBe('30 / 120')
    expect(m.ariaValueText).toBe('30 de 120')
  })

  it('anuncia a quantidade concluída em aria-valuenow, não a porcentagem', () => {
    const m = progressMeter({ label: 'x', done: 30, total: 120 })
    expect(m.ariaValueNow).toBe(30)
    expect(m.ariaValueMax).toBe(120)
  })

  it('nunca passa de 100% quando o feito excede o total', () => {
    const m = progressMeter({ label: 'x', done: 999, total: 100 })
    expect(m.pct).toBe(100)
    expect(m.counter).toBe('100 / 100')
    expect(m.ariaValueNow).toBe(100)
  })

  it('nunca fica negativo quando o feito é negativo', () => {
    const m = progressMeter({ label: 'x', done: -5, total: 100 })
    expect(m.pct).toBe(0)
    expect(m.counter).toBe('0 / 100')
    expect(m.ariaValueNow).toBe(0)
  })
})
