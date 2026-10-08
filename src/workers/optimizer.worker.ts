/// <reference lib="webworker" />
import init, { Fsrs, initThreadPool } from 'fsrs-browser'

export interface OptimizeRequest {
  /** Histórico agrupado por cartão, em ordem cronológica. */
  ratings: number[]
  deltaTs: number[]
  lengths: number[]
}

export type OptimizeResponse =
  | { ok: true; parameters: number[] }
  | { ok: false; error: string }

let ready: Promise<void> | null = null

async function ensureReady() {
  ready ??= (async () => {
    await init()
    // O otimizador usa rayon. Com isolamento de origem, roda em paralelo;
    // sem isolamento, seguimos com uma thread só — mais lento, mas funciona.
    if (self.crossOriginIsolated) {
      const threads = Math.min(4, navigator.hardwareConcurrency || 1)
      if (threads > 1) await initThreadPool(threads)
    }
  })()
  return ready
}

self.onmessage = async (e: MessageEvent<OptimizeRequest>) => {
  try {
    await ensureReady()
    const { ratings, deltaTs, lengths } = e.data

    const fsrs = new Fsrs()
    const parameters = fsrs.computeParameters(
      new Uint32Array(ratings),
      new Uint32Array(deltaTs),
      new Uint32Array(lengths),
      undefined,
      true,
    )
    fsrs.free()

    const response: OptimizeResponse = { ok: true, parameters: Array.from(parameters) }
    self.postMessage(response)
  } catch (err) {
    const response: OptimizeResponse = { ok: false, error: describeFailure(err) }
    self.postMessage(response)
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
