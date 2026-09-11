import { describe, expect, it } from 'vitest'
import { wins } from './lww'

describe('wins', () => {
  it('aceita o registro que chega quando não existe nada local', () => {
    const incoming = { id: 'c1', updatedAt: 1000 }

    expect(wins(incoming, undefined)).toBe(true)
  })

  it('mantém a versão mais recente ao comparar registro do arquivo com o local', () => {
    const incoming = { id: 'c1', updatedAt: 2000 }
    const local = { id: 'c1', updatedAt: 1000 }

    expect(wins(incoming, local)).toBe(true)
  })

  it('rejeita o registro que chega quando o local é mais recente', () => {
    const incoming = { id: 'c1', updatedAt: 1000 }
    const local = { id: 'c1', updatedAt: 2000 }

    expect(wins(incoming, local)).toBe(false)
  })

  it('desempata por id quando os dois lados têm o mesmo updatedAt', () => {
    const older = { id: 'a', updatedAt: 1000 }
    const newer = { id: 'b', updatedAt: 1000 }

    expect(wins(newer, older)).toBe(true)
    expect(wins(older, newer)).toBe(false)
  })

  it('rejeita o registro idêntico a si mesmo para não reescrever sem motivo', () => {
    const row = { id: 'c1', updatedAt: 1000 }

    expect(wins(row, { ...row })).toBe(false)
  })
})
