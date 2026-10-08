import { describe, expect, it } from 'vitest'
import { toTrainingItems } from './optimizerHistory'

const DAY = 86_400_000
const HOUR = 3_600_000

describe('toTrainingItems', () => {
  it('gera uma sequência por revisão em outro dia, com todo o histórico anterior', () => {
    const history = [
      { rating: 3, at: 0 },
      { rating: 1, at: 3 * DAY },
      { rating: 3, at: 8 * DAY },
    ]

    const request = toTrainingItems([history])

    expect(request.lengths).toEqual([2, 3])
    expect(request.ratings).toEqual([3, 1, 3, 1, 3])
    expect(request.deltaTs).toEqual([0, 3, 0, 3, 5])
  })

  it('descarta sequências que terminam no mesmo dia da revisão anterior', () => {
    const history = [
      { rating: 1, at: 0 },
      { rating: 3, at: 10 * 60_000 },
      { rating: 3, at: 2 * DAY },
    ]

    const request = toTrainingItems([history])

    expect(request.lengths).toEqual([3])
    expect(request.deltaTs).toEqual([0, 0, 2])
  })

  it('não gera nada para um cartão revisado só no mesmo dia', () => {
    const history = [
      { rating: 1, at: 0 },
      { rating: 3, at: 5 * HOUR },
    ]

    expect(toTrainingItems([history])).toEqual({ ratings: [], deltaTs: [], lengths: [] })
  })

  it('arredonda o intervalo para o dia mais próximo', () => {
    const history = [
      { rating: 3, at: 0 },
      { rating: 3, at: 13 * HOUR },
      { rating: 3, at: 13 * HOUR + 2 * DAY + 11 * HOUR },
    ]

    expect(toTrainingItems([history]).deltaTs).toEqual([0, 1, 0, 1, 2])
  })

  it('emenda as sequências de vários cartões na ordem recebida', () => {
    const first = [
      { rating: 3, at: 0 },
      { rating: 3, at: DAY },
    ]
    const second = [
      { rating: 1, at: 0 },
      { rating: 3, at: 4 * DAY },
    ]

    const request = toTrainingItems([first, second])

    expect(request.lengths).toEqual([2, 2])
    expect(request.ratings).toEqual([3, 3, 1, 3])
    expect(request.deltaTs).toEqual([0, 1, 0, 4])
  })
})
