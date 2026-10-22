import { advanceProgress, PROGRESS_POLL_MS, readOptimizerProgress, type OptimizerProgress } from './optimizerProgress'
import type { OptimizeRequest, OptimizeResponse } from '../workers/optimizer.worker'

const TIMEOUT_MS = 180_000

export interface ComputeOptions {
  onProgress?: (progress: OptimizerProgress | null) => void
}

type ProgressSource = Extract<OptimizeResponse, { type: 'progress-source' }>

function pollProgress(source: ProgressSource, onProgress: NonNullable<ComputeOptions['onProgress']>) {
  let latest: OptimizerProgress | null = null
  return window.setInterval(() => {
    latest = advanceProgress(latest, readOptimizerProgress(source.buffer, source.pointer))
    onProgress(latest)
  }, PROGRESS_POLL_MS)
}

/** Roda o cálculo no worker; a leitura do progresso para sempre antes de a memória virar lixo. */
export function computeInWorker(
  worker: Worker,
  request: OptimizeRequest,
  { onProgress }: ComputeOptions = {},
): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    let poller: number | undefined
    const stop = () => {
      clearTimeout(timeout)
      clearInterval(poller)
    }
    const timeout = setTimeout(() => {
      stop()
      reject(new Error('O otimizador demorou demais.'))
    }, TIMEOUT_MS)
    worker.onmessage = (e: MessageEvent<OptimizeResponse>) => {
      if (e.data.type === 'progress-source') {
        if (onProgress) poller = pollProgress(e.data, onProgress)
        return
      }
      stop()
      if (e.data.type === 'done') resolve(e.data.parameters)
      else reject(new Error(e.data.error))
    }
    worker.onerror = () => {
      stop()
      reject(new Error('O otimizador não pôde ser carregado.'))
    }
    worker.postMessage(request)
  })
}
