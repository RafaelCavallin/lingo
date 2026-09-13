export type SessionPhase = 'disabled' | 'anonymous' | 'restoring' | 'signed-in'

export interface SessionPhaseInput {
  configured: boolean
  /** `undefined` = ainda lendo o Dexie; `null` = este aparelho nunca teve conta. */
  boundUserId: string | null | undefined
  restored: boolean
  hasSession: boolean
}

/**
 * Decide o que a UI mostra antes da sessão do Supabase resolver. O caso que
 * importa é `boundUserId === null`: quem nunca fez login não baixa o
 * `supabase-js` nem espera nada — vê "Entrar" já no primeiro frame, sem
 * skeleton, porque não há sessão nenhuma para restaurar.
 */
export function sessionPhase(input: SessionPhaseInput): SessionPhase {
  if (!input.configured) return 'disabled'
  if (input.hasSession) return 'signed-in'
  if (input.boundUserId === null) return 'anonymous'
  if (input.boundUserId === undefined || !input.restored) return 'restoring'
  return 'anonymous'
}
