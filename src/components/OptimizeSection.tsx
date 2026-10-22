import { useEffect, useState } from 'react'
import type { Deck } from '../services/db'
import { describeParameters } from '../services/fsrsConfig'
import { MIN_REVIEWS, optimize, reviewCount } from '../services/optimizer'
import type { OptimizerProgress } from '../services/optimizerProgress'
import { optimizeProgressText, parametersStatusText } from './optimizeStatus'
import { ProgressBar } from './ProgressBar'
import { Message, Section } from './SettingsControls'
import { useAsyncAction } from './useAsyncAction'

const SUCCESS_MESSAGE =
  'Parâmetros atualizados. Os novos intervalos valem a partir da próxima revisão de cada frase.'
const TICK_MS = 1000

function useElapsedSeconds(running: boolean): number {
  const [elapsedS, setElapsedS] = useState(0)
  useEffect(() => {
    if (!running) return setElapsedS(0)
    const start = Date.now()
    const id = window.setInterval(() => setElapsedS(Math.round((Date.now() - start) / TICK_MS)), TICK_MS)
    return () => window.clearInterval(id)
  }, [running])
  return elapsedS
}

export function OptimizeSection({ deck }: { deck: Deck }) {
  const [reviews, setReviews] = useState(0)
  const [progress, setProgress] = useState<OptimizerProgress | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const action = useAsyncAction(async () => {
    setSucceeded(false)
    setProgress(null)
    await optimize(deck, { onProgress: setProgress })
    setSucceeded(true)
  })
  const elapsedS = useElapsedSeconds(action.busy)

  useEffect(() => {
    void reviewCount(deck.id).then(setReviews)
    setSucceeded(false)
  }, [deck.id])

  const message = action.error ?? (succeeded ? SUCCESS_MESSAGE : null)
  const status = parametersStatusText({ info: describeParameters(deck), reviews, minReviews: MIN_REVIEWS })

  return (
    <Section title="Otimizar agendamento">
      <p className="text-sm text-muted">
        Reaprende os parâmetros do FSRS a partir do seu histórico, em vez dos padrões. Roda no
        próprio aparelho e pode levar alguns minutos.
      </p>
      <p className="mt-3 font-mono text-xs text-muted">{status}</p>
      <button
        onClick={() => void action.run()}
        disabled={action.busy || reviews < MIN_REVIEWS}
        aria-busy={action.busy}
        className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm transition enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-50"
      >
        {action.busy ? 'Otimizando…' : 'Otimizar com meu histórico'}
      </button>
      {action.busy && (
        <ProgressBar
          className="mt-4"
          label="Otimizando o agendamento"
          done={progress?.processed ?? null}
          total={progress?.total ?? null}
          counter={optimizeProgressText({ progress, elapsedS })}
        />
      )}
      <div role="status" aria-live="polite">
        <Message state={{ message, tone: action.error ? 'bad' : 'ok' }} />
      </div>
    </Section>
  )
}
