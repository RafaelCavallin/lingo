import type { BackupPreview } from '../services/backupRestore'
import { formatBytes } from './formatBytes'

/** Acima disso o navegador pode demorar ou ficar sem espaço — o aviso é para
 *  o usuário decidir, não para impedir. */
const LARGE_FILE = 100 * 1024 * 1024

export function RestoreSummary({ preview }: { preview: BackupPreview }) {
  const { counts } = preview
  return (
    <div>
      <p className="mt-2 font-mono text-xs text-muted">
        gerado em {new Date(preview.exportedAt).toLocaleString('pt-BR')}
      </p>
      <ul className="mt-6 space-y-1 text-sm text-text/90">
        <li>
          {counts.decks} baralhos · {counts.cards} cartões · {counts.reviewLogs} revisões
        </li>
        <li>
          {counts.recordings} gravações suas · {counts.narrations} narrações ·{' '}
          {formatBytes(preview.audioBytes)} de áudio
        </li>
        {preview.discarded > 0 && (
          <li className="text-miss">{preview.discarded} registros ilegíveis serão descartados</li>
        )}
      </ul>
      {preview.accountMismatch && (
        <p className="mt-4 rounded-lg border border-miss/40 bg-miss/10 px-3 py-2 text-sm text-miss">
          Este backup foi gerado em outra conta. Restaurar vai misturar os dados das duas.
        </p>
      )}
      {preview.audioBytes > LARGE_FILE && (
        <p className="mt-4 rounded-lg border border-line px-3 py-2 text-sm text-muted">
          O áudio deste arquivo é grande: a restauração pode demorar ou faltar espaço no navegador.
        </p>
      )}
    </div>
  )
}
