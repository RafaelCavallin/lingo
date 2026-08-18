import { useState } from 'react'
import { db, type Deck } from '../services/db'
import { newCard } from '../services/scheduler'
import { speech } from '../services/audio'
import { CardForm, type CardFormValues } from '../components/CardForm'
import { MobileNav } from '../components/MobileNav'

export function AddCard({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [saved, setSaved] = useState(0)

  async function save({ sentence, translation, phonetic, hints, clozeRanges }: CardFormValues) {
    const card = newCard(deck.id, sentence, translation, hints, phonetic)
    if (clozeRanges.length) card.clozeRanges = clozeRanges
    await db.cards.add(card)
    void speech.warm(card.id, card.sentence)
    setSaved((n) => n + 1)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <button onClick={onBack} className="hover:text-text">← Início</button>
          {saved > 0 && <span className="truncate text-hit">{saved} salvas nesta sessão</span>}
        </div>
        <MobileNav />
      </header>

      <CardForm title="Nova frase" submitLabel="Salvar e adicionar outra" onSubmit={save} />
    </div>
  )
}
