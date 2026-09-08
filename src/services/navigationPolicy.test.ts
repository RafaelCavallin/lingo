import { describe, expect, it } from 'vitest'
import { shouldReturnHome } from './navigationPolicy'

describe('shouldReturnHome', () => {
  it('devolve à Home quando um baralho é criado', () => {
    expect(shouldReturnHome({ kind: 'deck-created' })).toBe(true)
  })

  it('devolve à Home quando o login direto do usuário conclui', () => {
    const trigger = { kind: 'sign-in-settled', userInitiated: true, plan: null } as const
    expect(shouldReturnHome(trigger)).toBe(true)
  })

  it('devolve à Home quando o usuário escolhe juntar os dados', () => {
    const trigger = { kind: 'sign-in-settled', userInitiated: true, plan: 'merge' } as const
    expect(shouldReturnHome(trigger)).toBe(true)
  })

  it('devolve à Home quando o usuário escolhe usar só os dados da conta', () => {
    const trigger = { kind: 'sign-in-settled', userInitiated: true, plan: 'discard-local' } as const
    expect(shouldReturnHome(trigger)).toBe(true)
  })

  it('não redireciona quando o usuário cancela a decisão de dados', () => {
    const trigger = { kind: 'sign-in-settled', userInitiated: true, plan: 'cancel' } as const
    expect(shouldReturnHome(trigger)).toBe(false)
  })

  it('não redireciona quando a sessão é restaurada no boot', () => {
    const trigger = { kind: 'sign-in-settled', userInitiated: false, plan: null } as const
    expect(shouldReturnHome(trigger)).toBe(false)
  })

  it('não redireciona um evento de sessão em segundo plano, mesmo com plano definido', () => {
    const plans = ['merge', 'discard-local', 'cancel'] as const
    for (const plan of plans) {
      expect(shouldReturnHome({ kind: 'sign-in-settled', userInitiated: false, plan })).toBe(false)
    }
  })
})
