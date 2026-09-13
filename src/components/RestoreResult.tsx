import type { RestoreReport } from '../services/backupRestore'
import { nothingApplied } from './restoreResult'

export function RestoreResult({ report, onBack }: { report: RestoreReport; onBack: () => void }) {
  const { applied } = report
  const nadaAplicado = nothingApplied(applied)
  return (
    <div role="status">
      <h1 className="font-display text-3xl text-hit">Backup restaurado</h1>
      <ul className="mt-6 space-y-1 text-sm text-text/90">
        <li>
          {applied.decks} baralhos · {applied.cards} cartões · {applied.reviewLogs} revisões
        </li>
        <li>{applied.audio} áudios restaurados</li>
        {report.tombstoned > 0 && <li>{report.tombstoned} cartões e baralhos descartados</li>}
        {report.skippedStale > 0 && (
          <li className="text-muted">
            {report.skippedStale} áudios ficaram de fora por não corresponderem mais à frase do cartão
          </li>
        )}
        {report.skippedInvalid > 0 && (
          <li className="text-muted">{report.skippedInvalid} registros ilegíveis foram descartados</li>
        )}
      </ul>
      {report.audioIncomplete && (
        <p className="mt-4 rounded-lg border border-miss/40 bg-miss/10 px-3 py-2 text-sm text-miss">
          O espaço do navegador acabou antes de terminar o áudio. Seus cartões e seu histórico estão
          completos; as narrações que faltam são geradas de novo na próxima revisão.
        </p>
      )}
      {nadaAplicado && (
        <p className="mt-4 text-sm text-muted">
          Nada foi aplicado porque o que já está neste aparelho é mais recente que o arquivo.
        </p>
      )}
      <button
        onClick={onBack}
        className="mt-8 rounded-full bg-signal px-6 py-3 text-sm font-medium text-ink transition hover:brightness-110"
      >
        Voltar ao início
      </button>
    </div>
  )
}
