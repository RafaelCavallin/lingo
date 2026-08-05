import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeck } from '../contexts/DeckContext'
import { liveCards, type Deck } from '../services/db'

/**
 * Último passo da importação: para qual baralho do Lingo os cartões escolhidos
 * vão. Começa no baralho ativo, que é o destino esperado na maioria das vezes,
 * e permite criar um baralho na hora — normalmente com o nome do baralho de
 * origem no Anki já preenchido.
 */
export function ImportTarget({
  count,
  suggestedName,
  onBack,
  onConfirm,
}: {
  count: number
  suggestedName: string
  onBack: () => void
  /** Entrega o baralho inteiro: o recém-criado ainda não apareceu na live query. */
  onConfirm: (target: Deck) => void
}) {
  const { deck, decks, createDeck } = useDeck()
  const [targetId, setTargetId] = useState(deck?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState(suggestedName)
  const [busy, setBusy] = useState(false)

  const newName = name.trim()
  // Com o campo de baralho novo aberto e preenchido, é ele que manda —
  // os rádios ficam desmarcados para não haver dois destinos aparentes.
  const usingNew = creating && newName.length > 0
  const existing = decks.find((d) => d.id === targetId)
  const targetName = usingNew ? newName : existing?.name

  async function confirm() {
    if (!targetName || busy) return
    setBusy(true)
    try {
      const target = usingNew ? await createDeck(newName) : existing
      if (target) onConfirm(target)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8">
      <p className="font-mono text-xs uppercase tracking-wider text-signal">
        {count} {count === 1 ? 'frase escolhida' : 'frases escolhidas'}
      </p>
      <h2 className="mt-2 font-display text-2xl">Para qual baralho?</h2>

      <ul className="mt-6 space-y-1">
        {decks.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-line/40">
              <input
                type="radio"
                name="import-target"
                checked={!usingNew && targetId === d.id}
                onChange={() => {
                  setTargetId(d.id)
                  setCreating(false)
                }}
                className="h-4 w-4 shrink-0 accent-signal"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              <CardCount deckId={d.id} />
            </label>
          </li>
        ))}
      </ul>

      {creating ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          placeholder="Nome do baralho novo"
          className="mt-3 w-full rounded-xl border border-signal bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-line py-3 text-sm text-muted transition hover:border-signal hover:text-signal"
        >
          + Novo baralho
        </button>
      )}

      <div className="sticky bottom-0 -mx-5 mt-6 flex items-center gap-4 border-t border-line bg-ink/95 px-5 py-4 backdrop-blur">
        <button onClick={onBack} className="shrink-0 font-mono text-xs text-muted hover:text-text">
          ← Voltar
        </button>
        <button
          onClick={confirm}
          disabled={!targetName || busy}
          className="min-w-0 flex-1 truncate rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
        >
          {targetName ? `Importar em "${targetName}"` : 'Dê um nome ao baralho'}
        </button>
      </div>
    </div>
  )
}

function CardCount({ deckId }: { deckId: string }) {
  const count = useLiveQuery(() => liveCards(deckId).count(), [deckId])
  if (count === undefined) return null
  return <span className="shrink-0 font-mono text-[10px] text-muted">{count}</span>
}
