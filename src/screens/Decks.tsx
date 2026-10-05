import { useDeck } from '../contexts/DeckContext'
import { DeckRow } from '../components/DeckRow'
import { MobileNav } from '../components/MobileNav'
import { NewDeckForm } from '../components/NewDeckForm'
import { useDeckManagement } from '../components/useDeckManagement'

export function Decks({ onBack }: { onBack: () => void }) {
  const { deck: activeDeck, decks, switchDeck, createDeck } = useDeck()
  const { rename, remove, busy, error } = useDeckManagement()
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-8">
      <header className="flex items-baseline justify-between gap-4 font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        <MobileNav />
      </header>
      <main className="flex-1 py-8" aria-busy={busy}>
        <h1 className="font-display text-3xl">Baralhos</h1>
        <ul className="mt-6 divide-y divide-line">
          {decks.map((d) => (
            <DeckRow
              key={d.id}
              deck={d}
              active={d.id === activeDeck?.id}
              disabled={busy}
              onOpen={() => switchDeck(d.id)}
              onRename={(name) => rename(d.id, name)}
              onRemove={(cardCount) => void remove(d, cardCount)}
            />
          ))}
        </ul>
        <NewDeckForm createDeck={createDeck} disabled={busy} />
        {error && <p className="mt-3 text-sm text-miss">{error}</p>}
      </main>
    </div>
  )
}
