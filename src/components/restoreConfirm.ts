import type { RestorePlan } from '../services/backupTypes'

export interface RestoreConfirmation {
  warnings: string[]
  action: string
}

const ACCOUNT_WARNING =
  'Este backup foi gerado em outra conta. Os dados das duas vão se misturar neste aparelho e em todos os outros ligados à conta atual.'

const REPLACE_WARNING =
  'Seus cartões e baralhos atuais que não estão no arquivo serão descartados. Um backup do estado de agora será baixado antes.'

const REAPPEAR_WARNING =
  'Este aparelho está ligado a uma conta: o descarte chega aos outros aparelhos no próximo sync. Mas cartões e baralhos criados ou editados em outro aparelho e ainda não sincronizados podem voltar a aparecer. Sincronize esses aparelhos antes, se quiser evitar isso.'

export function confirmationFor({
  plan,
  accountMismatch,
  boundToAccount,
}: {
  plan: RestorePlan
  accountMismatch: boolean
  boundToAccount: boolean
}): RestoreConfirmation | null {
  const warnings: string[] = []
  if (accountMismatch) warnings.push(ACCOUNT_WARNING)
  if (plan === 'replace') warnings.push(REPLACE_WARNING)
  if (plan === 'replace' && boundToAccount) warnings.push(REAPPEAR_WARNING)
  if (warnings.length === 0) return null
  return {
    warnings,
    action: plan === 'replace' ? 'Sim, substituir tudo' : 'Sim, restaurar mesmo assim',
  }
}
