import { describe, expect, it } from 'vitest'
import { optimizeProgressText, parametersStatusText } from './optimizeStatus'
import type { DeckParametersInfo } from '../services/fsrsConfig'

const OPTIMIZED_AT = new Date('2026-10-08T15:00:00Z').getTime()

function info(overrides: Partial<DeckParametersInfo> = {}): DeckParametersInfo {
  return { fsrsVersion: 'FSRS-6', source: 'default', optimizedAt: null, ...overrides }
}

describe('parametersStatusText', () => {
  it('descreve o baralho com parâmetros padrão', () => {
    const text = parametersStatusText({ info: info(), reviews: 413, minReviews: 400 })

    expect(text).toBe('FSRS-6 · parâmetros padrão · 413 revisões acumuladas · mínimo de 400')
  })

  it('descreve o baralho otimizado com a data', () => {
    const text = parametersStatusText({
      info: info({ source: 'optimized', optimizedAt: OPTIMIZED_AT }),
      reviews: 480,
      minReviews: 400,
    })

    expect(text).toBe('FSRS-6 · parâmetros otimizados em 08/10/2026 · 480 revisões acumuladas · mínimo de 400')
  })

  it('avisa que os parâmetros vieram de uma versão anterior e sugere otimizar de novo', () => {
    const text = parametersStatusText({
      info: info({ source: 'legacy', optimizedAt: OPTIMIZED_AT }),
      reviews: 10,
      minReviews: 400,
    })

    expect(text).toBe(
      'FSRS-6 · parâmetros de uma versão anterior do FSRS em 08/10/2026: otimize de novo · 10 revisões acumuladas · mínimo de 400',
    )
  })
})

describe('optimizeProgressText', () => {
  it('formata o contador com porcentagem, itens e tempo', () => {
    const text = optimizeProgressText({ progress: { processed: 1234, total: 3300 }, elapsedS: 42 })

    expect(text).toBe('37% · 1.234 de 3.300 itens · 42s')
  })

  it('formata o contador indeterminado só com o tempo', () => {
    expect(optimizeProgressText({ progress: null, elapsedS: 4 })).toBe('calculando… · 4s')
  })

  it('chega a 100% quando tudo foi processado', () => {
    expect(optimizeProgressText({ progress: { processed: 50, total: 50 }, elapsedS: 9 })).toBe(
      '100% · 50 de 50 itens · 9s',
    )
  })
})
