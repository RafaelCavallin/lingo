/** Registro que participa da resolução de conflito: só id e versão importam. */
export interface Versioned {
  id: string
  updatedAt: number
}

/**
 * Last-write-wins com desempate determinístico por id quando `updatedAt`
 * empata — sem isto, dois aparelhos editando no mesmo milissegundo nunca
 * convergem: cada um rejeita o outro como "não mais novo". Vale igual para a
 * linha que chega do servidor e para o registro que chega de um backup.
 */
export function wins(incoming: Versioned, local: Versioned | undefined): boolean {
  if (!local) return true
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt
  return incoming.id > local.id
}
