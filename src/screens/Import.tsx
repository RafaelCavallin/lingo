import { useState } from 'react'
import { db, type Deck } from '../services/db'
import { newCard } from '../services/scheduler'
import type { AnkiDeckFile, AnkiNote } from '../services/ankiImport'
import { activeVoice, setVoice, speech } from '../services/audio'
import { useDeck } from '../contexts/DeckContext'
import { AnkiNotePicker } from '../components/AnkiNotePicker'
import { ImportTarget } from '../components/ImportTarget'

type Stage =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'map'; file: AnkiDeckFile; front: number; back: number }
  | { name: 'select'; file: AnkiDeckFile; front: number; back: number }
  | {
      name: 'target'
      notes: AnkiNote[]
      front: number
      back: number
      suggestedName: string
      /** Para onde o botão voltar leva — o estágio de onde as notas vieram. */
      from: 'map' | 'select'
      file: AnkiDeckFile
    }
  | { name: 'importing'; total: number; done: number; phase: 'cards' | 'audio' }
  | { name: 'done'; count: number; deckName: string }

// O baralho de destino é escolhido no fim do fluxo, então esta tela não
// depende mais do baralho ativo — quem precisa dele é o ImportTarget.
export function Import({ onBack }: { onBack: () => void }) {
  const { switchDeck } = useDeck()
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)
  // Índices marcados no seletor. Fica aqui, e não no componente, para que ir
  // ao destino e voltar não apague o que o usuário já tinha escolhido.
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function pick(file: File) {
    setError(null)
    setStage({ name: 'reading' })
    try {
      // sql.js e JSZip só são baixados quando alguém realmente importa —
      // mantém o app leve para quem só estuda.
      const { readApkg } = await import('../services/ankiImport')
      const parsed = await readApkg(file)
      setSelected(new Set())
      setStage({ name: 'map', file: parsed, front: 0, back: Math.min(1, parsed.fieldNames.length - 1) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
      setStage({ name: 'pick' })
    }
  }

  async function run(target: Deck, notes: AnkiNote[], front: number, back: number) {
    const usable = notes.filter((n) => n.fields[front]?.trim())
    setStage({ name: 'importing', total: usable.length, done: 0, phase: 'cards' })

    const cards = usable.map((n) =>
      newCard(target.id, n.fields[front], n.fields[back] ?? '', []),
    )
    await db.cards.bulkAdd(cards)

    // O áudio é gerado em lote, com concorrência limitada. Se falhar, o cartão
    // entra mesmo assim e a narração sai na primeira revisão.
    setStage({ name: 'importing', total: cards.length, done: 0, phase: 'audio' })
    const { runPool } = await import('../services/ankiImport')

    // A voz é global e acompanha o baralho ativo. Importando para outro
    // baralho, a narração sairia com a voz errada e seria descartada na
    // primeira revisão — gerar com a voz do destino evita esse retrabalho.
    const previousVoice = activeVoice()
    setVoice(target.voice)
    try {
      await runPool(
        cards,
        (c) => speech.warm(c.id, c.sentence),
        3,
        (done) => setStage({ name: 'importing', total: cards.length, done, phase: 'audio' }),
      )
    } finally {
      setVoice(previousVoice)
    }

    // Terminar no baralho que recebeu os cartões: é nele que o usuário quer
    // continuar, e a home já abre mostrando o que acabou de entrar.
    switchDeck(target.id)
    setStage({ name: 'done', count: cards.length, deckName: target.name })
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
              {stage.file.deckNames.length > 1 && ` · ${stage.file.deckNames.length} baralhos`}
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
              onClick={() =>
                setStage({
                  name: 'target',
                  file: stage.file,
                  notes: stage.file.notes,
                  front: stage.front,
                  back: stage.back,
                  suggestedName: stage.file.deckNames.length === 1 ? stage.file.deckNames[0] : '',
                  from: 'map',
                })
              }
              className="mt-8 w-full rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110"
            >
              Importar todas as {stage.file.notes.length} frases
            </button>
            <button
              onClick={() => setStage({ ...stage, name: 'select' })}
              className="mt-3 w-full rounded-2xl border border-line py-4 font-medium text-muted transition hover:border-signal hover:text-text"
            >
              Escolher os cartões
            </button>
          </div>
        )}

        {stage.name === 'select' && (
          <AnkiNotePicker
            file={stage.file}
            front={stage.front}
            back={stage.back}
            selected={selected}
            setSelected={setSelected}
            onBack={() => setStage({ ...stage, name: 'map' })}
            onConfirm={(notes, deckFilter) =>
              setStage({
                name: 'target',
                file: stage.file,
                notes,
                front: stage.front,
                back: stage.back,
                suggestedName: deckFilter,
                from: 'select',
              })
            }
          />
        )}

        {stage.name === 'target' && (
          <ImportTarget
            count={stage.notes.length}
            suggestedName={stage.suggestedName}
            onBack={() => {
              const previous = { file: stage.file, front: stage.front, back: stage.back }
              setStage(
                stage.from === 'select'
                  ? { name: 'select', ...previous }
                  : { name: 'map', ...previous },
              )
            }}
            onConfirm={(target) => run(target, stage.notes, stage.front, stage.back)}
          />
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
              Entraram em <span className="text-text">{stage.deckName}</span>, que já é o baralho
              ativo. São cartões novos: vão ser introduzidos aos poucos, no ritmo em que você
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
