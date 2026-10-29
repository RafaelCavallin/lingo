import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteCard, liveCards, type Card, type Deck } from '../services/db'
import { AsyncRegion } from '../components/AsyncRegion'
import { MobileNav } from '../components/MobileNav'
import { CardRow } from '../components/CardRow'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { CARDS_PAGE_SIZE, nextVisibleCount } from '../components/loadMore'
import { CardsListSkeleton } from '../components/CardsListSkeleton'
import { Skeleton } from '../components/Skeleton'
import { usePendingIndicator } from '../components/usePendingIndicator'
import { EditCard } from './EditCard'

export function Cards({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(CARDS_PAGE_SIZE)
  const [editing, setEditing] = useState<Card | null>(null)

  const cards = useLiveQuery(() => liveCards(deck.id).reverse().sortBy('createdAt'), [deck.id])

  const filtered = useMemo(() => {
    if (!cards) return null
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.sentence.toLowerCase().includes(q) ||
        c.translation.toLowerCase().includes(q) ||
        (c.phonetic?.toLowerCase().includes(q) ?? false),
    )
  }, [cards, query])

  useEffect(() => {
    setVisibleCount(CARDS_PAGE_SIZE)
  }, [query, deck.id])

  const visible = filtered?.slice(0, visibleCount)

  function loadMore() {
    const total = filtered?.length ?? 0
    setVisibleCount((n) => nextVisibleCount({ visible: n, total, step: CARDS_PAGE_SIZE }))
  }

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

  // Chamado incondicionalmente, antes do `return` cedo de baixo: um hook não
  // pode ficar atrás de uma condição que muda entre renders (`editing`).
  const showLoading = usePendingIndicator(filtered === null)

  // Tela de edição dedicada no lugar da lista; a lista reflete a mudança
  // sozinha ao voltar (useLiveQuery).
  if (editing) return <EditCard card={editing} onDone={() => setEditing(null)} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        {/* flex-1: acima de md o ☰ some e este bloco volta a ocupar a linha
            inteira, mantendo o contador na borda direita como antes. */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <button onClick={onBack} className="hover:text-text">← Início</button>
          {filtered === null ? (
            <Skeleton shape="text" width="4.5rem" height="0.875rem" />
          ) : (
            <span className="truncate">{filtered.length} cartões</span>
          )}
        </div>
        <MobileNav />
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

        <AsyncRegion
          loading={showLoading}
          label="Carregando seus cartões…"
          skeleton={
            <div className="mt-6">
              <CardsListSkeleton />
            </div>
          }
        >
          <ul className="mt-6 divide-y divide-line">
            {filtered !== null && filtered.length === 0 && (
              <p className="py-8 text-center text-muted">
                {query ? 'Nenhum cartão bate com a busca.' : 'Este baralho ainda não tem cartões.'}
              </p>
            )}
            {visible?.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                selected={selected.has(c.id)}
                onToggle={toggle}
                onEdit={setEditing}
                onRemove={removeOne}
              />
            ))}
          </ul>
          <LoadMoreButton shown={visible?.length ?? 0} total={filtered?.length ?? 0} onLoadMore={loadMore} />
        </AsyncRegion>
      </main>
    </div>
  )
}
