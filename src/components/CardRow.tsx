import type { Card } from '../services/db'
import { MarkedText } from './MarkedText'

const ROW_STYLE = { contentVisibility: 'auto', containIntrinsicSize: '0 88px' } as const

type CardRowProps = {
  card: Card
  selected: boolean
  onToggle: (id: string) => void
  onEdit: (card: Card) => void
  onRemove: (card: Card) => void
}

export function CardRow({ card, selected, onToggle, onEdit, onRemove }: CardRowProps) {
  return (
    <li style={ROW_STYLE} className="flex items-start gap-3 py-4">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(card.id)}
        className="mt-1.5 h-4 w-4 shrink-0 accent-signal"
        aria-label="Selecionar cartão"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-snug">
          <MarkedText text={card.sentence} emphasis={card.emphasisRanges} />
        </p>
        <p className="mt-1 truncate text-sm text-muted">
          <MarkedText text={card.translation} emphasis={card.translationEmphasisRanges} />
        </p>
      </div>
      <button
        onClick={() => onEdit(card)}
        aria-label="Editar cartão"
        className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
      >
        Editar
      </button>
      <button
        onClick={() => onRemove(card)}
        aria-label="Excluir cartão"
        className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-miss hover:text-miss"
      >
        Excluir
      </button>
    </li>
  )
}
