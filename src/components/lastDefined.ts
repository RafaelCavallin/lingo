export interface LastDefined<T> {
  value: T | undefined
  /** `true` só antes do primeiro valor definido — nunca de novo num refetch. */
  firstLoad: boolean
}

export interface LastDefinedMemory<T> {
  key: unknown
  value: T | undefined
}

const NO_KEY = Symbol('sem chave')

/**
 * Antídoto do `useLiveQuery` que devolve `undefined` a cada refetch (troca de
 * baralho, tick de 30s): mantém o último valor visto em vez de deixar a tela
 * voltar ao skeleton no meio do uso.
 *
 * `key` é opcional — sem ela, todo refetch é tratado como o mesmo contexto.
 * Quando ela muda (ex.: o id do baralho), a memória do valor anterior é
 * descartada: sem isso, trocar para um baralho vazio mostraria por um
 * instante a contagem do baralho anterior, em vez do skeleton.
 */
export function nextLastDefined<T>(
  memory: LastDefinedMemory<T> | undefined,
  incoming: T | undefined,
  key: unknown = NO_KEY,
): LastDefined<T> & { memory: LastDefinedMemory<T> } {
  const carried = memory && memory.key === key ? memory.value : undefined
  if (incoming !== undefined) return { value: incoming, firstLoad: false, memory: { key, value: incoming } }
  if (carried !== undefined) return { value: carried, firstLoad: false, memory: { key, value: carried } }
  return { value: undefined, firstLoad: true, memory: { key, value: undefined } }
}
