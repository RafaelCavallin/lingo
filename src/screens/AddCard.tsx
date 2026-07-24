import { useState } from 'react'
import { db, type Deck, type Hint, type HintType } from '../services/db'
import { newCard } from '../services/scheduler'
import { speech, normalRate } from '../services/audio'
import { enrich, EnrichUnavailable } from '../services/enrich'
import { ClozeEditor, type Range } from '../components/ClozeEditor'

const HINT_TYPES: { value: HintType; label: string }[] = [
  { value: 'phrasal_verb', label: 'Phrasal verb' },
  { value: 'false_cognate', label: 'Falso amigo' },
  { value: 'pronunciation', label: 'Pronúncia' },
  { value: 'custom', label: 'Nota' },
]

export function AddCard({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [sentence, setSentence] = useState('')
  const [translation, setTranslation] = useState('')
  const [hints, setHints] = useState<Hint[]>([])
  const [ranges, setRanges] = useState<Range[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'manual'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [saved, setSaved] = useState(0)

  const ready = sentence.trim().length > 0 && translation.trim().length > 0

  async function generate() {
    if (!sentence.trim()) return
    setStatus('loading')
    setNotice(null)
    try {
      const result = await enrich(sentence.trim())
      setTranslation(result.translation)
      // Dicas escritas por você nunca são sobrescritas pela geração.
      setHints((prev) => [...prev.filter((h) => h.source === 'user'), ...result.hints])
      setStatus('idle')
    } catch (e) {
      setStatus(e instanceof EnrichUnavailable ? 'manual' : 'idle')
      setNotice(e instanceof Error ? e.message : 'Não foi possível gerar agora.')
    }
  }

  async function save() {
    if (!ready) return
    const card = newCard(deck.id, sentence, translation, hints)
    if (ranges.length) card.clozeRanges = ranges
    await db.cards.add(card)
    void speech.warm(card.id, card.sentence)
    setSentence('')
    setTranslation('')
    setHints([])
    setRanges([])
    setNotice(null)
    setSaved((n) => n + 1)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        {saved > 0 && <span className="text-hit">{saved} salvas nesta sessão</span>}
      </header>

      <main className="flex-1 py-10">
        <h1 className="font-display text-3xl">Nova frase</h1>

        <label className="mt-8 block font-mono text-xs uppercase tracking-wider text-muted">
          Frase em inglês
        </label>
        <textarea
          value={sentence}
          onChange={(e) => {
            setSentence(e.target.value)
            setRanges([])
          }}
          onBlur={() => status === 'idle' && !translation && generate()}
          rows={2}
          placeholder="I'm looking forward to seeing you again."
          className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 font-display text-xl outline-none placeholder:text-muted/40 focus:border-signal"
        />

        {sentence.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button
              onClick={() => speech.speak('preview', sentence, normalRate())}
              className="font-mono text-xs uppercase tracking-wider text-muted hover:text-signal"
            >
              ▸ Ouvir
            </button>
            <button
              onClick={generate}
              disabled={status === 'loading'}
              className="font-mono text-xs uppercase tracking-wider text-signal disabled:text-muted"
            >
              {status === 'loading' ? 'Gerando…' : '↻ Gerar tradução e dicas'}
            </button>
          </div>
        )}

        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}

        {sentence.trim() && (
          <div className="mt-8">
            <label className="block font-mono text-xs uppercase tracking-wider text-muted">
              Lacunas
            </label>
            <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
              <ClozeEditor sentence={sentence} ranges={ranges} onChange={setRanges} />
            </div>
          </div>
        )}

        <label className="mt-8 block font-mono text-xs uppercase tracking-wider text-muted">
          Tradução
        </label>
        <textarea
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          rows={2}
          placeholder={status === 'manual' ? 'Estou ansioso para ver você de novo.' : 'Gerada ao sair do campo acima — edite à vontade.'}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-lg outline-none placeholder:text-muted/40 focus:border-signal"
        />

        <div className="mt-8 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">Dicas</span>
          <button
            onClick={() => setHints((h) => [...h, { type: 'custom', text: '', source: 'user' }])}
            className="font-mono text-xs text-signal hover:brightness-110"
          >
            + adicionar
          </button>
        </div>

        {hints.length === 0 ? (
          <p className="mt-3 text-sm text-muted/70">
            Nenhuma dica ainda. Elas chegam com a geração, e você ajusta ou escreve as suas.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {hints.map((h, i) => (
              <li key={i} className="flex gap-2">
                <select
                  value={h.type}
                  onChange={(e) =>
                    setHints((hs) =>
                      hs.map((x, j) => (j === i ? { ...x, type: e.target.value as HintType, source: 'user' } : x)),
                    )
                  }
                  className="rounded-lg border border-line bg-surface px-2 py-2 font-mono text-xs text-muted outline-none focus:border-signal"
                >
                  {HINT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  value={h.text}
                  onChange={(e) =>
                    setHints((hs) =>
                      hs.map((x, j) => (j === i ? { ...x, text: e.target.value, source: 'user' } : x)),
                    )
                  }
                  placeholder="look forward to = aguardar ansiosamente"
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
                />
                <button
                  onClick={() => setHints((hs) => hs.filter((_, j) => j !== i))}
                  aria-label="Remover dica"
                  className="px-2 text-muted hover:text-miss"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={save}
        disabled={!ready}
        className="w-full rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
      >
        Salvar e adicionar outra
      </button>
    </div>
  )
}
