import type { RestorePlan } from './backupTypes'

export interface RestoreChoice {
  plan: RestorePlan
  includeNarrations: boolean
  skipDuplicates: boolean
  safetyCopy: boolean
}

/** Substituir sempre guarda uma cópia antes; mesclar só se o usuário deixar a opção marcada. */
export function wantsSafetyCopy({ plan, safetyCopy }: Pick<RestoreChoice, 'plan' | 'safetyCopy'>): boolean {
  return plan === 'replace' || safetyCopy
}
