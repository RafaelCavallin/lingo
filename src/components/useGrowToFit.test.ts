import { describe, expect, it } from 'vitest'
import { growToFit } from './useGrowToFit'

function textarea({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const el = document.createElement('textarea')
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight })
  return el
}

describe('growToFit', () => {
  it('estica o textarea até a altura do conteúdo quando o texto não cabe', () => {
    const el = textarea({ scrollHeight: 120, clientHeight: 48 })

    growToFit(el)

    expect(el.style.height).toBe('120px')
  })

  it('deixa a altura automática quando o texto já cabe', () => {
    const el = textarea({ scrollHeight: 48, clientHeight: 48 })
    el.style.height = '200px'

    growToFit(el)

    expect(el.style.height).toBe('auto')
  })

  it('ignora quando ainda não há elemento', () => {
    expect(() => growToFit(null)).not.toThrow()
  })
})
