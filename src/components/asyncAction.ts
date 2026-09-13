const FALLBACK_MESSAGE = 'Não foi possível concluir agora.'

/** Centraliza só a extração — o fallback é opcional porque cada chamador
 *  costuma ter uma mensagem mais específica do que a genérica. */
export function errorMessageOf(error: unknown, fallback: string = FALLBACK_MESSAGE): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** Guarda de reentrância: o segundo clique no mesmo tick não inicia outra corrida. */
export function shouldStart(busy: boolean): boolean {
  return !busy
}
