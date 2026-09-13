import { useRef } from 'react'
import { nextLastDefined, type LastDefined, type LastDefinedMemory } from './lastDefined'

/** Ver `nextLastDefined`: mantém o último valor visto entre refetches do
 *  `useLiveQuery`, para o skeleton não reaparecer no meio do uso. Passe
 *  `key` quando o valor for escopado por algo que muda em tempo de vida do
 *  componente (ex.: o baralho ativo), para não carregar a memória de um
 *  contexto para o outro. */
export function useLastDefined<T>(value: T | undefined, key?: unknown): LastDefined<T> {
  const memory = useRef<LastDefinedMemory<T> | undefined>(undefined)
  const result = nextLastDefined(memory.current, value, key)
  memory.current = result.memory
  return { value: result.value, firstLoad: result.firstLoad }
}
