import { useDeck } from '../contexts/DeckContext'
import { useAsyncAction } from './useAsyncAction'
import type { Deck } from '../services/db'

export function useDeckManagement() {
  const { decks, renameDeck, removeDeck } = useDeck()
  const renameAction = useAsyncAction(async (id: string, name: string) => renameDeck(id, name))
  const removeAction = useAsyncAction(async (target: Deck, cardCount: number) => {
    if (decks.length <= 1) {
      alert('Não é possível excluir o único baralho. Crie outro antes.')
      return
    }
    const loss = cardCount === 1 ? 'o 1 cartão' : `os ${cardCount} cartões`
    if (!confirm(`Excluir o baralho "${target.name}" e ${loss} dele? Não tem como desfazer.`)) return
    await removeDeck(target.id)
  })
  return {
    rename: renameAction.run,
    remove: removeAction.run,
    busy: renameAction.busy || removeAction.busy,
    error: renameAction.error ?? removeAction.error,
  }
}
