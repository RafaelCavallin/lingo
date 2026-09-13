import { describe, expect, it } from 'vitest'
import { errorMessageOf, shouldStart } from './asyncAction'

describe('errorMessageOf', () => {
  it('usa a mensagem do Error', () => {
    expect(errorMessageOf(new Error('falhou'))).toBe('falhou')
  })

  it('cai no texto padrão para uma string solta', () => {
    expect(errorMessageOf('algo')).toBe('Não foi possível concluir agora.')
  })

  it('cai no texto padrão para undefined', () => {
    expect(errorMessageOf(undefined)).toBe('Não foi possível concluir agora.')
  })

  it('cai no texto padrão para um Error sem mensagem', () => {
    expect(errorMessageOf(new Error())).toBe('Não foi possível concluir agora.')
  })

  it('usa o fallback informado no lugar do texto padrão', () => {
    expect(errorMessageOf('algo', 'Não foi possível ler o arquivo.')).toBe('Não foi possível ler o arquivo.')
  })

  it('ainda prefere a mensagem do Error mesmo com fallback informado', () => {
    expect(errorMessageOf(new Error('falhou'), 'outro texto')).toBe('falhou')
  })
})

describe('shouldStart', () => {
  it('recusa iniciar enquanto já está ocupado', () => {
    expect(shouldStart(true)).toBe(false)
  })

  it('permite iniciar quando está livre', () => {
    expect(shouldStart(false)).toBe(true)
  })
})
