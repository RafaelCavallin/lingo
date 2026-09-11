import type { RestorePlan } from '../services/backupRestore'

export interface RestoreConfirmation {
  warnings: string[]
  action: string
}

const ACCOUNT_WARNING =
  'Este backup foi gerado em outra conta. Os dados das duas vão se misturar neste aparelho e em todos os outros ligados à conta atual.'

const REPLACE_WARNING =
  'Seus cartões e baralhos atuais que não estão no arquivo serão descartados, também nos outros aparelhos. Um backup do estado de agora será baixado antes.'

export function confirmationFor({
  plan,
  accountMismatch,
}: {
  plan: RestorePlan
  accountMismatch: boolean
}): RestoreConfirmation | null {
  const warnings: string[] = []
  if (accountMismatch) warnings.push(ACCOUNT_WARNING)
  if (plan === 'replace') warnings.push(REPLACE_WARNING)
  if (warnings.length === 0) return null
  return {
    warnings,
    action: plan === 'replace' ? 'Sim, substituir tudo' : 'Sim, restaurar mesmo assim',
  }
}
