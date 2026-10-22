/// <reference lib="webworker" />
import init, { Fsrs, Progress, initThreadPool } from 'fsrs-browser'

export interface OptimizeRequest {
  /** Histórico agrupado por cartão, em ordem cronológica. */
  ratings: number[]
  deltaTs: number[]
  lengths: number[]
}

export type OptimizeResponse =
  | { type: 'progress-source'; buffer: ArrayBufferLike; pointer: number }
  | { type: 'done'; parameters: number[] }
  | { type: 'error'; error: string }

const MAX_THREADS = 4

interface Runtime {
  memory: WebAssembly.Memory
  parallel: boolean
}

let ready: Promise<Runtime> | null = null

async function ensureReady(): Promise<Runtime> {
  ready ??= (async () => {
    const { memory } = await init()
    // O otimizador usa rayon. Com isolamento de origem, roda em paralelo;
    // sem isolamento, seguimos com uma thread só — mais lento, mas funciona.
    const threads = self.crossOriginIsolated ? Math.min(MAX_THREADS, navigator.hardwareConcurrency || 1) : 1
    if (threads > 1) await initThreadPool(threads)
    return { memory, parallel: threads > 1 }
  })()
  return ready
}

function post(response: OptimizeResponse) {
  self.postMessage(response)
}

/** O monitor de progresso do fsrs-browser roda no pool do rayon: sem pool, não há progresso. */
function startProgress({ memory, parallel }: Runtime): Progress | undefined {
  if (!parallel) return undefined
  const progress = Progress.new()
  post({ type: 'progress-source', buffer: memory.buffer, pointer: progress.pointer() })
  return progress
}

function compute(request: OptimizeRequest, progress: Progress | undefined): number[] {
  const fsrs = new Fsrs()
  const parameters = fsrs.computeParameters(
    new Uint32Array(request.ratings),
    new Uint32Array(request.deltaTs),
    new Uint32Array(request.lengths),
    progress,
    true,
  )
  fsrs.free()
  return Array.from(parameters)
}

self.onmessage = async (e: MessageEvent<OptimizeRequest>) => {
  try {
    const runtime = await ensureReady()
    post({ type: 'done', parameters: compute(e.data, startProgress(runtime)) })
  } catch (err) {
    post({ type: 'error', error: describeFailure(err) })
  }
}

const WASM_PANIC_MESSAGE =
  'O otimizador não conseguiu aprender com o histórico atual. Continue estudando por mais alguns dias e tente de novo.'

/** Um panic do Rust chega como RuntimeError("unreachable"), que não diz nada a quem estuda. */
function describeFailure(err: unknown): string {
  if (err instanceof WebAssembly.RuntimeError) return WASM_PANIC_MESSAGE
  if (err instanceof Error && err.message) return err.message
  return 'O otimizador não conseguiu rodar neste navegador.'
}
