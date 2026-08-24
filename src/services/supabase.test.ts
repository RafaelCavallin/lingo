import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadModule() {
  vi.resetModules()
  return import('./supabase')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('isSyncConfigured', () => {
  it('é falso quando faltam as variáveis do Supabase', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')

    const { isSyncConfigured } = await loadModule()

    expect(isSyncConfigured()).toBe(false)
  })

  it('é falso quando só a URL está preenchida', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')

    const { isSyncConfigured } = await loadModule()

    expect(isSyncConfigured()).toBe(false)
  })

  it('é verdadeiro com URL e chave publicável', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste')

    const { isSyncConfigured } = await loadModule()

    expect(isSyncConfigured()).toBe(true)
  })
})

describe('getSupabase', () => {
  it('rejeita sem estourar o app quando o sync não está configurado', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')

    const { getSupabase } = await loadModule()

    await expect(getSupabase()).rejects.toThrow('Supabase não configurado.')
  })

  it('cria o cliente uma única vez e reaproveita nas chamadas seguintes', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste')

    const { getSupabase } = await loadModule()
    const [first, second] = await Promise.all([getSupabase(), getSupabase()])

    expect(first).toBe(second)
    expect(typeof first.auth.getSession).toBe('function')
  })
})
