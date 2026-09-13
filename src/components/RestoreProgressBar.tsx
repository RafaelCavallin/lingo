import { restoreProgressView, type RestoreStage } from '../services/restoreProgressView'
import { ProgressBar } from './ProgressBar'

export function RestoreProgressBar({
  stage,
  includesSafetyBackup,
}: {
  stage: RestoreStage
  includesSafetyBackup: boolean
}) {
  const view = restoreProgressView(stage, includesSafetyBackup)
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-muted">
        Passo {view.stepIndex} de {view.stepCount}
      </p>
      {/* `role="status"` só aqui, não na barra: o texto muda 2-3 vezes no
          fluxo inteiro, mas o contador da barra muda a cada item — colocar
          tudo na mesma live region faria um leitor de tela recitar cada
          incremento de uma restauração com centenas de áudios. */}
      <h1 role="status" aria-live="polite" className="mt-2 font-display text-3xl">
        {view.label}
      </h1>
      <ProgressBar label={view.label} done={view.done} total={view.total} className="mt-6" />
    </div>
  )
}
