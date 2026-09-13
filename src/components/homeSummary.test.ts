import { describe, expect, it } from 'vitest'
import { homeView, studyButtonLabel } from './homeSummary'

describe('homeView', () => {
  it('fica em loading enquanto o total ainda não chegou — nunca em onboarding', () => {
    const view = homeView({ total: undefined, queueSize: null, minutes: 0 })
    expect(view.kind).toBe('loading')
  })

  it('mostra o onboarding só quando o total já chegou e é zero', () => {
    expect(homeView({ total: 0, queueSize: null, minutes: 0 }).kind).toBe('onboarding')
  })

  it('mostra o dia quando há cartões, mesmo com a fila ainda não pronta', () => {
    const view = homeView({ total: 12, queueSize: null, minutes: 0 })
    expect(view).toEqual({ kind: 'today', queueSize: null, minutes: 0 })
  })

  it('carrega a fila e os minutos quando tudo já chegou', () => {
    const view = homeView({ total: 12, queueSize: 5, minutes: 8 })
    expect(view).toEqual({ kind: 'today', queueSize: 5, minutes: 8 })
  })
})

describe('studyButtonLabel', () => {
  it('nunca afirma "nada vencido" enquanto a fila ainda está sendo contada', () => {
    expect(studyButtonLabel(null)).toBe('Contando o que vence hoje…')
  })

  it('avisa que não há nada vencido só depois de contar de verdade', () => {
    expect(studyButtonLabel(0)).toBe('Nada vencido agora')
  })

  it('convida a estudar quando há fila', () => {
    expect(studyButtonLabel(5)).toBe('Estudar')
  })
})
