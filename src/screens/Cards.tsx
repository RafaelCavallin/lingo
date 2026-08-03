import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteCard, liveCards, type Card, type Deck } from '../services/db'

/**
 * Um deck importado do Anki chega com milhares de cartões. Renderizar todos
 * de uma vez trava o scroll; `content-visibility: auto` deixa o navegador
 * pular o layout de linhas fora da tela sem precisar de uma lib de
 * virtualização só para isto.
 */
const ROW_STYLE = { contentVisibility: 'auto', containIntrinsicSize: '0 88px' } as const

export function Cards({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const cards = useLiveQuery(() => liveCards(deck.id).reverse().sortBy('createdAt'), [deck.id])

  const filtered = useMemo(() => {
    if (!cards) return null
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) => c.sentence.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q),
    )
  }, [cards, query])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function removeOne(card: Card) {
    if (!confirm(`Excluir "${card.sentence}"?`)) return
    await deleteCard(card.id)
    setSelected((s) => {
      if (!s.has(card.id)) return s
      const next = new Set(s)
      next.delete(card.id)
      return next
    })
  }

  async function removeSelected() {
    const count = selected.size
    if (count === 0) return
    if (!confirm(`Excluir ${count} ${count === 1 ? 'cartão' : 'cartões'}? Não tem como desfazer.`)) return
    for (const id of selected) await deleteCard(id)
    setSelected(new Set())
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        <span>{filtered?.length ?? 0} cartões</span>
      </header>

      <main className="flex-1 py-8">
        <h1 className="font-display text-3xl">Cartões</h1>
        <p className="mt-2 text-sm text-muted">{deck.name}</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por frase ou tradução"
          className="mt-6 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
        />

        {selected.size > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-miss/40 bg-miss/10 px-4 py-3">
            <span className="text-sm text-miss">
              {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <div className="flex gap-3">
              <button onClick={() => setSelected(new Set())} className="text-sm text-muted hover:text-text">
                Cancelar
              </button>
              <button onClick={removeSelected} className="text-sm font-medium text-miss hover:brightness-110">
                Excluir
              </button>
            </div>
          </div>
        )}

        <ul className="mt-6 divide-y divide-line">
          {filtered === null && <p className="py-8 text-center text-muted">Carregando…</p>}
          {filtered?.length === 0 && (
            <p className="py-8 text-center text-muted">
              {query ? 'Nenhum cartão bate com a busca.' : 'Este baralho ainda não tem cartões.'}
            </p>
          )}
          {filtered?.map((c) => (
            <li key={c.id} style={ROW_STYLE} className="flex items-start gap-3 py-4">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-1.5 h-4 w-4 shrink-0 accent-signal"
                aria-label="Selecionar cartão"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg leading-snug">{c.sentence}</p>
                <p className="mt-1 truncate text-sm text-muted">{c.translation}</p>
              </div>
              <button
                onClick={() => removeOne(c)}
                aria-label="Excluir cartão"
                className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-miss hover:text-miss"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
