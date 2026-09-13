import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeck } from '../contexts/DeckContext'
import { totalQueueCount } from '../services/scheduler'
import { useLastDefined } from './useLastDefined'

/** Passo do relógio: abaixo do menor intervalo de aprendizado do FSRS. */
const TICK_MS = 30_000

/**
 * As contagens de fila dependem de `Date.now()`, e o Dexie só avisa escrita —
 * nunca a passagem do tempo. Sem este relógio, um cartão que vence com a tela
 * já aberta só apareceria no recarregamento seguinte. Para enquanto a aba está
 * escondida e recalcula assim que ela volta.
 */
export function useDueTick(): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let id: number | undefined
    const advance = () => setTick((t) => t + 1)
    const start = () => (id ??= window.setInterval(advance, TICK_MS))
    const stop = () => {
      if (id !== undefined) window.clearInterval(id)
      id = undefined
    }
    const onVisibility = () => {
      stop()
      if (document.hidden) return
      advance()
      start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return tick
}

/**
 * Fila somada de todos os baralhos — o total pendente da conta, não só o do
 * ativo. `undefined` só antes da primeira leitura: o tick de 30s refaz a
 * contagem, e sem `useLastDefined` o badge voltaria a piscar a cada refetch.
 */
export function useTotalDueCount(): number | undefined {
  const { decks } = useDeck()
  const tick = useDueTick()
  const count = useLiveQuery(() => totalQueueCount(decks), [decks, tick])
  return useLastDefined(count).value
}
