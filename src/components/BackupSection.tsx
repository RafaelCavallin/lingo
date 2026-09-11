import { useEffect, useState } from 'react'
import { estimateBackupSize, type BackupSizeEstimate } from '../services/backupRecords'
import { useNavigation } from '../contexts/NavigationContext'
import { formatBytes } from './formatBytes'
import { Message, Section, Toggle } from './SettingsControls'

type State = { busy: boolean; message: string | null; tone: 'ok' | 'bad' | null }

const IDLE: State = { busy: false, message: null, tone: null }

export function BackupSection() {
  const { navigate } = useNavigation()
  const [withNarrations, setWithNarrations] = useState(false)
  const [estimate, setEstimate] = useState<BackupSizeEstimate | null>(null)
  const [state, setState] = useState<State>(IDLE)

  useEffect(() => {
    void estimateBackupSize().then(setEstimate)
  }, [])

  const base = estimate ? estimate.data + estimate.recordings : 0
  const total = estimate ? base + (withNarrations ? estimate.narrations : 0) : 0

  async function generate() {
    setState({ busy: true, message: null, tone: null })
    try {
      const { downloadBackup } = await import('../services/backupExport')
      await downloadBackup({ includeNarrations: withNarrations })
      setState({ busy: false, message: 'Backup baixado.', tone: 'ok' })
    } catch {
      setState({ busy: false, message: 'Não foi possível gerar o backup.', tone: 'bad' })
    }
  }

  return (
    <Section title="Backup e restauração">
      <p className="text-sm text-muted">
        O arquivo leva seus baralhos, cartões, histórico de revisões e as gravações da sua voz —
        que não são sincronizadas e só existem neste aparelho. Guarde-o fora do navegador.
      </p>
      <div className="mt-4">
        <Toggle
          label="Incluir as narrações já geradas"
          checked={withNarrations}
          onChange={setWithNarrations}
          hint={
            estimate
              ? `Deixa o arquivo maior (+${formatBytes(estimate.narrations)}), e evita gerar o áudio de novo depois de restaurar.`
              : 'Deixa o arquivo maior, e evita gerar o áudio de novo depois de restaurar.'
          }
        />
      </div>
      <p className="mt-4 font-mono text-xs text-muted">
        {estimate ? `arquivo estimado: ${formatBytes(total)}` : 'calculando o tamanho…'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          onClick={() => void generate()}
          disabled={state.busy}
          className="rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
        >
          {state.busy ? 'Gerando…' : 'Baixar backup'}
        </button>
        <button
          onClick={() => navigate('restore')}
          className="rounded-full border border-line px-5 py-2.5 text-sm transition hover:border-signal hover:text-signal"
        >
          Restaurar um backup
        </button>
      </div>
      <Message state={state} />
    </Section>
  )
}
