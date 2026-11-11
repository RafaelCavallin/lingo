import type { BackupPreview } from '../services/backupTypes'
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
      <p className="mt-1 font-mono text-xs text-muted">
        formato v{preview.formatVersion}
        {preview.appVersion ? ` · app ${preview.appVersion}` : ''}
      </p>
      {preview.convertedFrom !== null && (
        <p className="mt-3 text-sm text-muted">
          Este arquivo é da versão {preview.convertedFrom} do formato e foi convertido para a atual ao
          ser lido. O arquivo em si não muda.
        </p>
      )}
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
        {preview.unknownValues > 0 && (
          <li className="text-miss">
            Desses, {preview.unknownValues} por valores que este app não conhece: o arquivo pode ter sido
            criado por uma versão mais nova do Lingo. Atualize o app se isso não era esperado.
          </li>
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
