import { useAuth } from '../contexts/AuthContext'
import { useAsyncAction } from './useAsyncAction'

/**
 * Modal de nível de app, não da tela de Conta: a decisão de mesclar ou
 * descartar dados chega pelo evento SIGNED_IN do Supabase, que pode resolver
 * depois que o usuário já navegou para outro lugar.
 */
export function AccountTransition() {
  const { pendingDecision, resolvePending } = useAuth()
  const action = useAsyncAction(resolvePending)
  if (!pendingDecision || pendingDecision.kind === 'resume' || pendingDecision.kind === 'auto-adopt') {
    return null
  }

  const { local, remote } = pendingDecision
  const isSwitch = pendingDecision.kind === 'account-switch'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-transition-title"
      aria-busy={action.busy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-5"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5">
        <h2 id="account-transition-title" className="font-display text-xl">
          {isSwitch ? 'Trocar de conta' : 'Esta conta já tem dados'}
        </h2>

        {isSwitch && (
          <p className="mt-3 text-sm text-miss">
            Este aparelho estava vinculado a outra conta. Não é possível juntar dados de contas
            diferentes — escolha continuar com os dados desta conta ou cancelar.
          </p>
        )}

        <p className="mt-3 text-sm text-muted">
          Neste aparelho: {local.decks} {local.decks === 1 ? 'baralho' : 'baralhos'}, {local.cards}{' '}
          {local.cards === 1 ? 'cartão' : 'cartões'}, {local.reviewLogs} revisões.
          <br />
          Nesta conta: {remote.decks} {remote.decks === 1 ? 'baralho' : 'baralhos'}, {remote.cards}{' '}
          {remote.cards === 1 ? 'cartão' : 'cartões'}, {remote.reviewLogs} revisões.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {!isSwitch && (
            <button
              onClick={() => void action.run('merge')}
              disabled={action.busy}
              className="rounded-xl bg-signal py-2.5 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
            >
              {action.busy ? 'Um instante…' : 'Juntar os dados'}
            </button>
          )}
          <button
            onClick={() => void action.run('discard-local')}
            disabled={action.busy}
            className="rounded-xl border border-line py-2.5 text-sm transition hover:border-signal hover:text-signal disabled:opacity-60"
          >
            Usar só os dados da conta
          </button>
          <button
            onClick={() => void action.run('cancel')}
            disabled={action.busy}
            className="py-2 text-sm text-muted hover:text-text disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>

        {action.error && <p className="mt-3 text-sm text-miss">{action.error}</p>}
      </div>
    </div>
  )
}
