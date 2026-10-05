import { useState } from 'react'
import { DeckCountsText } from './DeckCountsText'
import { DeckNameField } from './DeckNameField'
import { useDeckCounts } from './useDeckCounts'
import type { Deck } from '../services/db'

interface DeckRowProps {
  deck: Deck
  active: boolean
  disabled: boolean
  onOpen: () => void
  onRename: (name: string) => Promise<void>
  onRemove: (cardCount: number) => void
}

const ACTION_CLASS = 'shrink-0 font-mono text-[10px] uppercase text-muted disabled:opacity-40'

export function DeckRow({ deck, active, disabled, onOpen, onRename, onRemove }: DeckRowProps) {
  const [editName, setEditName] = useState<string | null>(null)
  const counts = useDeckCounts(deck.id)
  const commitRename = () => {
    if (editName === null) return
    setEditName(null)
    void onRename(editName)
  }
  return (
    <li className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <DeckNameField
          name={deck.name}
          active={active}
          editValue={editName}
          disabled={disabled}
          onOpen={onOpen}
          onEditChange={setEditName}
          onCommit={commitRename}
        />
        <DeckCountsText counts={counts} />
      </div>
      <button onClick={() => setEditName(deck.name)} disabled={disabled} className={`${ACTION_CLASS} hover:text-text`}>
        editar
      </button>
      <button onClick={() => onRemove(counts?.total ?? 0)} disabled={disabled} className={`${ACTION_CLASS} hover:text-miss`}>
        excluir
      </button>
    </li>
  )
}
