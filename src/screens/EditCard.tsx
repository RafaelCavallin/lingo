import { updateCard, type Card } from '../services/db'
import { speech } from '../services/audio'
import { CardForm, type CardFormValues } from '../components/CardForm'
import { MobileNav } from '../components/MobileNav'

export function EditCard({ card, onDone }: { card: Card; onDone: () => void }) {
  async function save({
    sentence,
    translation,
    phonetic,
    hints,
    clozeRanges,
    emphasisRanges,
    translationEmphasisRanges,
  }: CardFormValues) {
    await updateCard(card.id, {
      sentence,
      translation,
      phonetic,
      hints,
      clozeRanges,
      emphasisRanges,
      translationEmphasisRanges,
    })
    // Frase nova = TTS antigo já caiu no updateCard; re-aquece o cache.
    if (sentence !== card.sentence) void speech.warm(card.id, sentence)
    onDone()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <button onClick={onDone} className="hover:text-text">← Voltar</button>
        </div>
        <MobileNav />
      </header>

      <CardForm
        title="Editar frase"
        submitLabel="Salvar alterações"
        initial={{
          sentence: card.sentence,
          translation: card.translation,
          phonetic: card.phonetic ?? '',
          hints: card.hints,
          clozeRanges: card.clozeRanges ?? [],
          emphasisRanges: card.emphasisRanges ?? [],
          translationEmphasisRanges: card.translationEmphasisRanges ?? [],
        }}
        onSubmit={save}
      />
    </div>
  )
}
