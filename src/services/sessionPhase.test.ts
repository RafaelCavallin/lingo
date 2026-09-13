import { describe, expect, it } from 'vitest'
import { sessionPhase } from './sessionPhase'

const BASE = { configured: true, boundUserId: null, restored: true, hasSession: false }

describe('sessionPhase', () => {
  it('fica desabilitado quando o servidor não configurou sync, mesmo com sessão', () => {
    expect(sessionPhase({ ...BASE, configured: false, hasSession: true })).toBe('disabled')
  })

  it('fica conectado quando há sessão', () => {
    expect(sessionPhase({ ...BASE, hasSession: true })).toBe('signed-in')
  })

  it('fica anônimo sem passar por restaurando quando o aparelho nunca teve conta', () => {
    expect(sessionPhase({ ...BASE, boundUserId: null, restored: false })).toBe('anonymous')
  })

  it('fica restaurando enquanto ainda lê o vínculo do Dexie', () => {
    expect(sessionPhase({ ...BASE, boundUserId: undefined })).toBe('restoring')
  })

  it('fica restaurando quando há vínculo mas a sessão ainda não voltou', () => {
    expect(sessionPhase({ ...BASE, boundUserId: 'user-1', restored: false })).toBe('restoring')
  })

  it('fica anônimo quando o vínculo existe, a sessão restaurou e não há sessão', () => {
    expect(sessionPhase({ ...BASE, boundUserId: 'user-1', restored: true })).toBe('anonymous')
  })
})
