// Import só de tipo: apagado na compilação, não puxa o pacote para o bundle.
import type { SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSyncConfigured = () => Boolean(URL && KEY)

let clientPromise: Promise<SupabaseClient> | null = null

/**
 * Quem estuda offline sem conta nunca deve pagar o custo do cliente HTTP do
 * Supabase no caminho de estudo. Por isso o pacote só é baixado aqui dentro,
 * via import dinâmico, na primeira vez que alguém realmente tenta entrar,
 * cadastrar ou restaurar uma sessão existente — nunca no carregamento do app.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!isSyncConfigured()) return Promise.reject(new Error('Supabase não configurado.'))
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL!, KEY!),
    )
  }
  return clientPromise
}
