import { describe, expect, it } from 'vitest'
import { confirmationFor } from './restoreConfirm'

describe('confirmationFor', () => {
  it('deixa mesclar da própria conta seguir sem confirmação extra', () => {
    const confirmation = confirmationFor({ plan: 'merge', accountMismatch: false })

    expect(confirmation).toBeNull()
  })

  it('exige confirmação ao mesclar um arquivo gerado em outra conta', () => {
    const confirmation = confirmationFor({ plan: 'merge', accountMismatch: true })

    expect(confirmation).not.toBeNull()
    expect(confirmation?.warnings).toHaveLength(1)
    expect(confirmation?.warnings[0]).toContain('outra conta')
    expect(confirmation?.action).toBe('Sim, restaurar mesmo assim')
  })

  it('exige confirmação ao substituir tudo, mesmo sendo a própria conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: false })

    expect(confirmation?.warnings).toHaveLength(1)
    expect(confirmation?.warnings[0]).toContain('descartados')
    expect(confirmation?.action).toBe('Sim, substituir tudo')
  })

  it('avisa dos dois riscos ao substituir tudo com arquivo de outra conta', () => {
    const confirmation = confirmationFor({ plan: 'replace', accountMismatch: true })

    expect(confirmation?.warnings).toHaveLength(2)
    expect(confirmation?.warnings[0]).toContain('outra conta')
    expect(confirmation?.warnings[1]).toContain('descartados')
    expect(confirmation?.action).toBe('Sim, substituir tudo')
  })
})
