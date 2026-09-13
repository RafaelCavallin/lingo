export type RestoreStep = 'safety-backup' | 'data' | 'audio'

export interface RestoreStage {
  step: RestoreStep
  done: number | null
  total: number | null
}

export interface RestoreProgressView {
  label: string
  done: number | null
  total: number | null
  stepIndex: number
  stepCount: number
}

const STEP_LABEL: Record<RestoreStep, string> = {
  'safety-backup': 'Guardando um backup de segurança',
  data: 'Restaurando seus cartões',
  audio: 'Restaurando o áudio',
}

/**
 * A fase `data` é uma transação Dexie única — não há como reportar progresso
 * real dentro dela, então ela é sempre indeterminada, com o total de
 * registros no rótulo em vez de uma porcentagem que salta de 0% a 100%.
 * `safety-backup` e `audio` usam progresso de verdade quando o chamador tem
 * (zip e restauração de áudio já emitem eventos).
 */
export function restoreProgressView(stage: RestoreStage, includesSafetyBackup: boolean): RestoreProgressView {
  const steps: RestoreStep[] = includesSafetyBackup ? ['safety-backup', 'data', 'audio'] : ['data', 'audio']
  const stepIndex = steps.indexOf(stage.step) + 1
  const stepCount = steps.length
  if (stage.step === 'data') return dataProgress(stage, stepIndex, stepCount)
  if (stage.step === 'audio' && stage.total === 0) {
    return { label: 'Sem áudio para restaurar', done: 1, total: 1, stepIndex, stepCount }
  }
  return { label: `${STEP_LABEL[stage.step]}…`, done: stage.done, total: stage.total, stepIndex, stepCount }
}

function dataProgress(stage: RestoreStage, stepIndex: number, stepCount: number): RestoreProgressView {
  const base = STEP_LABEL.data
  const label = stage.total !== null && stage.total > 0 ? `${base} — ${stage.total} registros…` : `${base}…`
  return { label, done: null, total: null, stepIndex, stepCount }
}
