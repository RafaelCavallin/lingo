import { describe, expect, it } from 'vitest'
import { buildAppVersion } from './appVersion'

const FULL_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

describe('buildAppVersion', () => {
  it('junta a versão ao commit encurtado em 7 caracteres', () => {
    const result = buildAppVersion({ version: '1.2.3', commitSha: FULL_SHA })

    expect(result).toBe('1.2.3+a1b2c3d')
  })

  it('usa o sufixo dev quando o build não tem commit', () => {
    const result = buildAppVersion({ version: '1.0.0', commitSha: null })

    expect(result).toBe('1.0.0+dev')
  })

  it('trata commit vazio como ausente', () => {
    const result = buildAppVersion({ version: '1.0.0', commitSha: '' })

    expect(result).toBe('1.0.0+dev')
  })

  it('mantém inteiro um commit já curto', () => {
    const result = buildAppVersion({ version: '2.0.0', commitSha: 'abc12' })

    expect(result).toBe('2.0.0+abc12')
  })

  it('não altera a versão informada', () => {
    const result = buildAppVersion({ version: '10.20.30', commitSha: FULL_SHA })

    expect(result.startsWith('10.20.30+')).toBe(true)
  })
})
