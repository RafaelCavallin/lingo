import { describe, expect, it } from 'vitest'
import { advanceProgress, readOptimizerProgress } from './optimizerProgress'

function memoryWith(processed: number, total: number, pointer = 0): ArrayBuffer {
  const buffer = new ArrayBuffer(pointer + 8)
  new Uint32Array(buffer, pointer, 2).set([processed, total])
  return buffer
}

describe('readOptimizerProgress', () => {
  it('lê processados e total da memória compartilhada', () => {
    const buffer = memoryWith(1234, 3300)

    expect(readOptimizerProgress(buffer, 0)).toEqual({ processed: 1234, total: 3300 })
  })

  it('lê a partir do ponteiro informado', () => {
    const buffer = memoryWith(5, 20, 64)

    expect(readOptimizerProgress(buffer, 64)).toEqual({ processed: 5, total: 20 })
  })

  it.each([
    ['total zero', 0, 0],
    ['processados acima do total', 11, 10],
  ])('trata %s como leitura indeterminada', (_motivo, processed, total) => {
    expect(readOptimizerProgress(memoryWith(processed, total), 0)).toBeNull()
  })

  it.each([
    ['ponteiro além da memória', 64],
    ['ponteiro negativo', -4],
  ])('trata %s como leitura indeterminada', (_motivo, pointer) => {
    expect(readOptimizerProgress(new ArrayBuffer(8), pointer)).toBeNull()
  })
})

describe('advanceProgress', () => {
  it('adota a primeira leitura válida', () => {
    expect(advanceProgress(null, { processed: 10, total: 100 })).toEqual({ processed: 10, total: 100 })
  })

  it('avança quando a leitura nova está mais adiante', () => {
    const next = { processed: 60, total: 100 }

    expect(advanceProgress({ processed: 10, total: 100 }, next)).toEqual(next)
  })

  it('nunca faz o progresso recuar', () => {
    const previous = { processed: 60, total: 100 }

    expect(advanceProgress(previous, { processed: 10, total: 100 })).toEqual(previous)
  })

  it('compara a proporção quando o total muda entre as leituras', () => {
    const previous = { processed: 50, total: 100 }

    expect(advanceProgress(previous, { processed: 30, total: 100 })).toEqual(previous)
    expect(advanceProgress(previous, { processed: 700, total: 1000 })).toEqual({ processed: 700, total: 1000 })
  })

  it('mantém a leitura anterior quando a nova é inválida', () => {
    const previous = { processed: 60, total: 100 }

    expect(advanceProgress(previous, null)).toEqual(previous)
    expect(advanceProgress(null, null)).toBeNull()
  })
})
