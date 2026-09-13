import { describe, expect, it } from 'vitest'
import { restoreProgressView } from './restoreProgressView'

describe('restoreProgressView', () => {
  it('conta 3 passos quando o plano inclui o backup de segurança', () => {
    const view = restoreProgressView({ step: 'safety-backup', done: null, total: null }, true)
    expect(view.stepIndex).toBe(1)
    expect(view.stepCount).toBe(3)
  })

  it('conta 2 passos e "dados" é o primeiro quando não há backup de segurança', () => {
    const view = restoreProgressView({ step: 'data', done: null, total: null }, false)
    expect(view.stepIndex).toBe(1)
    expect(view.stepCount).toBe(2)
  })

  it('a fase de dados nunca vira determinada, mesmo recebendo done/total', () => {
    const view = restoreProgressView({ step: 'data', done: 50, total: 100 }, true)
    expect(view.done).toBeNull()
    expect(view.total).toBeNull()
    expect(view.label).toContain('100 registros')
  })

  it('a fase de backup de segurança fica determinada quando recebe progresso real', () => {
    const view = restoreProgressView({ step: 'safety-backup', done: 40, total: 100 }, true)
    expect(view.done).toBe(40)
    expect(view.total).toBe(100)
  })

  it('sem áudio para restaurar, a fase de áudio já nasce em 100%', () => {
    const view = restoreProgressView({ step: 'audio', done: 0, total: 0 }, true)
    expect(view.label).toBe('Sem áudio para restaurar')
    expect(view.done).toBe(1)
    expect(view.total).toBe(1)
  })

  it('com áudio a restaurar, repassa o progresso real', () => {
    const view = restoreProgressView({ step: 'audio', done: 12, total: 40 }, true)
    expect(view.done).toBe(12)
    expect(view.total).toBe(40)
    expect(view.stepIndex).toBe(3)
  })
})
