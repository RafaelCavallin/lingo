import { useState } from 'react'
import { db, type Deck } from '../services/db'
import { newCard } from '../services/scheduler'
import type { AnkiDeckFile } from '../services/ankiImport'
import { speech } from '../services/audio'

type Stage =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'map'; file: AnkiDeckFile; front: number; back: number }
  | { name: 'importing'; total: number; done: number; phase: 'cards' | 'audio' }
  | { name: 'done'; count: number }

export function Import({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)
    setStage({ name: 'reading' })
    try {
      // sql.js e JSZip só são baixados quando alguém realmente importa —
      // mantém o app leve para quem só estuda.
      const { readApkg } = await import('../services/ankiImport')
      const parsed = await readApkg(file)
      setStage({ name: 'map', file: parsed, front: 0, back: Math.min(1, parsed.fieldNames.length - 1) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
      setStage({ name: 'pick' })
    }
  }

  async function run(file: AnkiDeckFile, front: number, back: number) {
    const usable = file.notes.filter((n) => n.fields[front]?.trim())
    setStage({ name: 'importing', total: usable.length, done: 0, phase: 'cards' })

    const cards = usable.map((n) =>
      newCard(deck.id, n.fields[front], n.fields[back] ?? '', []),
    )
    await db.cards.bulkAdd(cards)

    // O áudio é gerado em lote, com concorrência limitada. Se falhar, o cartão
    // entra mesmo assim e a narração sai na primeira revisão.
    setStage({ name: 'importing', total: cards.length, done: 0, phase: 'audio' })
    const { runPool } = await import('../services/ankiImport')
    await runPool(
      cards,
      (c) => speech.warm(c.id, c.sentence),
      3,
      (done) => setStage({ name: 'importing', total: cards.length, done, phase: 'audio' }),
    )

    setStage({ name: 'done', count: cards.length })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-6">
      <header className="font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
      </header>

      <main className="flex-1 py-10">
        <h1 className="font-display text-3xl">Importar do Anki</h1>
        <p className="mt-3 max-w-md text-muted">
          Traz as frases dos seus baralhos atuais. O agendamento recomeça no FSRS e a narração é
          gerada aqui, então a voz fica igual em todos os cartões.
        </p>

        {error && <p className="mt-6 text-sm text-miss">{error}</p>}

        {stage.name === 'pick' && (
          <label className="mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line py-14 text-center transition hover:border-signal">
            <span className="font-medium">Escolher arquivo .apkg</span>
            <span className="mt-1 font-mono text-xs text-muted">exportado do Anki</span>
            <input
              type="file"
              accept=".apkg"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
            />
          </label>
        )}

        {stage.name === 'reading' && <p className="mt-8 text-muted">Lendo o arquivo…</p>}

        {stage.name === 'map' && (
          <div className="mt-8">
            <p className="font-mono text-xs uppercase tracking-wider text-signal">
              {stage.file.notes.length} notas encontradas
            </p>

            <FieldPicker
              label="Frase em inglês"
              names={stage.file.fieldNames}
              value={stage.front}
              onChange={(v) => setStage({ ...stage, front: v })}
            />
            <FieldPicker
              label="Tradução"
              names={stage.file.fieldNames}
              value={stage.back}
              onChange={(v) => setStage({ ...stage, back: v })}
            />

            <div className="mt-6 rounded-xl border border-line bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Prévia</p>
              <p className="mt-2 font-display text-lg">
                {stage.file.notes[0]?.fields[stage.front] || '—'}
              </p>
              <p className="mt-1 text-sm text-muted">
                {stage.file.notes[0]?.fields[stage.back] || '—'}
              </p>
            </div>

            <button
              onClick={() => run(stage.file, stage.front, stage.back)}
              className="mt-8 w-full rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110"
            >
              Importar {stage.file.notes.length} frases
            </button>
          </div>
        )}

        {stage.name === 'importing' && (
          <div className="mt-10">
            <p className="text-muted">
              {stage.phase === 'cards' ? 'Criando os cartões…' : 'Gerando a narração…'}
            </p>
            <div className="mt-4 h-[3px] w-full bg-line">
              <div
                className="h-full bg-signal transition-all"
                style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-muted">
              {stage.done} / {stage.total}
            </p>
          </div>
        )}

        {stage.name === 'done' && (
          <div className="mt-10">
            <p className="font-display text-3xl text-hit">{stage.count} frases importadas</p>
            <p className="mt-3 text-muted">
              Elas entram como cartões novos e serão introduzidas aos poucos, no ritmo em que você
              consolida as anteriores.
            </p>
            <button
              onClick={onBack}
              className="mt-8 rounded-full bg-signal px-6 py-3 font-medium text-ink transition hover:brightness-110"
            >
              Voltar ao início
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function FieldPicker({
  label,
  names,
  value,
  onChange,
}: {
  label: string
  names: string[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mt-6">
      <label className="block font-mono text-xs uppercase tracking-wider text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-signal"
      >
        {names.map((n, i) => (
          <option key={i} value={i}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}
