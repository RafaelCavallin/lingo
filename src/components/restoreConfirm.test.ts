import { describe, expect, it } from 'vitest'
import { confirmationFor } from './restoreConfirm'

const REAPPEAR_TEXT = 'podem voltar a aparecer'
const OLD_PROMISE = 'também nos outros aparelhos'

describe('confirmationFor', () => {
  it('deixa mesclar da própria conta seguir sem confirmação extra', () => {
    const confirmation = confirmationFor({ plan: 'merge', accountMismatch: false, boundToAccount: false })

    expect(confirmation).toBeNull()
  })

  it('exige confirmação ao mesclar um arquivo gerado em outra conta', () => {
    const confirmation = confirmationFor({ plan: 'merge', accountMismatch: true, boundToAccount: true })

    expect(confirmation).not.toBeNull()
    expect(confirmation?.warnings).toHaveLength(1)
    expect(confirmation?.warnings[0]).toContain('outra conta')
    expect(confirmation?.action).toBe('Sim, restaurar mesmo assim')
  })

  it('exige confirmação ao substituir tudo, mesmo sendo a própria conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: false, boundToAccount: false })

    expect(confirmation?.warnings).toHaveLength(1)
    expect(confirmation?.warnings[0]).toContain('descartados')
    expect(confirmation?.action).toBe('Sim, substituir tudo')
  })

  it('avisa dos dois riscos ao substituir tudo com arquivo de outra conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: true, boundToAccount: false })

    expect(confirmation?.warnings).toHaveLength(2)
    expect(confirmation?.warnings[0]).toContain('outra conta')
    expect(confirmation?.warnings[1]).toContain('descartados')
    expect(confirmation?.action).toBe('Sim, substituir tudo')
  })

  it('avisa que dados não sincronizados de outros aparelhos podem voltar ao substituir com conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: false, boundToAccount: true })

    const text = confirmation?.warnings.join(' ') ?? ''
    expect(confirmation?.warnings).toHaveLength(2)
    expect(text).toContain(REAPPEAR_TEXT)
    expect(text).not.toContain(OLD_PROMISE)
  })

  it('não promete descarte nos outros aparelhos nem sem conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: false, boundToAccount: false })

    expect(confirmation?.warnings.join(' ')).not.toContain(OLD_PROMISE)
  })

  it('não avisa de reaparecimento sem conta ligada', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: false, boundToAccount: false })

    expect(confirmation?.warnings.join(' ')).not.toContain(REAPPEAR_TEXT)
  })

  it('não avisa de reaparecimento ao mesclar, mesmo com conta ligada', () => {
    const confirmation = confirmationFor({ plan: 'merge', accountMismatch: false, boundToAccount: true })

    expect(confirmation).toBeNull()
  })
})
