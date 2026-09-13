import { describe, expect, it } from 'vitest'
import { nextLastDefined } from './lastDefined'

describe('nextLastDefined', () => {
  it('começa em firstLoad enquanto nunca houve valor', () => {
    const r = nextLastDefined(undefined, undefined)
    expect(r.value).toBeUndefined()
    expect(r.firstLoad).toBe(true)
  })

  it('sai de firstLoad assim que um valor chega', () => {
    const r = nextLastDefined(undefined, 42)
    expect(r.value).toBe(42)
    expect(r.firstLoad).toBe(false)
  })

  it('mantém o último valor quando o refetch devolve undefined', () => {
    const first = nextLastDefined(undefined, 42)
    const r = nextLastDefined(first.memory, undefined)
    expect(r.value).toBe(42)
    expect(r.firstLoad).toBe(false)
  })

  it('adota o valor novo quando ele chega', () => {
    const first = nextLastDefined(undefined, 42)
    const r = nextLastDefined(first.memory, 43)
    expect(r.value).toBe(43)
  })

  it('sem chave, o comportamento é o mesmo de antes', () => {
    const first = nextLastDefined(undefined, 10, 'a')
    const r = nextLastDefined(first.memory, undefined, 'a')
    expect(r.value).toBe(10)
  })

  it('descarta o valor anterior e volta a firstLoad quando a chave muda', () => {
    const first = nextLastDefined(undefined, 50, 'deck-1')

    const r = nextLastDefined(first.memory, undefined, 'deck-2')

    expect(r.value).toBeUndefined()
    expect(r.firstLoad).toBe(true)
  })

  it('preserva o valor quando a chave é igual e o refetch devolve undefined', () => {
    const first = nextLastDefined(undefined, 50, 'deck-1')

    const r = nextLastDefined(first.memory, undefined, 'deck-1')

    expect(r.value).toBe(50)
    expect(r.firstLoad).toBe(false)
  })
})
