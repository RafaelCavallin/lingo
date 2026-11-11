import { describe, expect, it } from 'vitest'
import { wantsSafetyCopy } from './restoreChoice'

describe('wantsSafetyCopy', () => {
  it('guarda a cópia ao substituir, mesmo com a opção desmarcada', () => {
    expect(wantsSafetyCopy({ plan: 'replace', safetyCopy: false })).toBe(true)
  })

  it('guarda a cópia ao mesclar quando a opção está marcada', () => {
    expect(wantsSafetyCopy({ plan: 'merge', safetyCopy: true })).toBe(true)
  })

  it('não guarda a cópia ao mesclar com a opção desmarcada', () => {
    expect(wantsSafetyCopy({ plan: 'merge', safetyCopy: false })).toBe(false)
  })
})
