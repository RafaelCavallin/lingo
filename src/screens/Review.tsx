import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteCard, type Card, type Deck } from '../services/db'
import { answer, buildQueue } from '../services/scheduler'
import { speech, normalRate, slowRate } from '../services/audio'
import { Waveform } from '../components/Waveform'
import { renderCloze } from '../components/ClozeEditor'
import { VoiceCompare } from '../components/VoiceCompare'

/** Fundo suficiente para cobrir a resposta mais rápida sem baixar a fila toda. */
const PREFETCH_AHEAD = 2

export function Review({ deck, onDone }: { deck: Deck; onDone: () => void }) {
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const shownAt = useRef(Date.now())

  const card = queue?.[index]

  useEffect(() => {
    buildQueue(deck).then(setQueue)
  }, [deck])

  const play = useCallback(
    async (rate: number) => {
      if (!card) return
      setAudioError(null)
      setPlaying(true)
      try {
        await speech.speak(card.id, card.sentence, rate)
      } catch (e) {
        setAudioError(e instanceof Error ? e.message : 'Não foi possível reproduzir o áudio.')
      } finally {
        setPlaying(false)
      }
    },
    [card],
  )

  // O áudio toca sozinho ao abrir o cartão. O toque em "Estudar" já
  // desbloqueou a reprodução automática para esta sessão.
  useEffect(() => {
    if (!card) return
    shownAt.current = Date.now()
    setRevealed(false)
    void play(normalRate())
    return () => speech.stop()
  }, [card, play])

  // Enquanto o cartão atual toca, os próximos já vão sendo baixados: quando o
  // usuário responde, o áudio seguinte sai do IndexedDB e começa na hora.
  useEffect(() => {
    if (!queue) return
    for (const next of queue.slice(index + 1, index + 1 + PREFETCH_AHEAD)) {
      void speech.warm(next.id, next.sentence)
    }
  }, [queue, index])

  async function rate(rating: 'again' | 'good') {
    if (!card) return
    await answer(card, rating, Date.now() - shownAt.current)
    setDone((d) => d + 1)
    // Ao errar, o áudio toca de novo com a resposta à vista antes de seguir.
    if (rating === 'again') await play(normalRate())
    setIndex((i) => i + 1)
  }

  // Tirar da fila em vez de avançar o índice: com um item a menos, o índice
  // atual já aponta para o próximo cartão, e o efeito de troca de card cuida
  // de tocar o áudio dele sozinho.
  async function remove() {
    if (!card) return
    if (!confirm('Excluir esta frase? Não tem como desfazer.')) return
    speech.stop()
    const id = card.id
    await deleteCard(id)
    setQueue((q) => q?.filter((c) => c.id !== id) ?? q)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault()
        revealed ? void rate('good') : setRevealed(true)
      }
      if (e.key === '1' && revealed) void rate('again')
      if (e.key === '2' && revealed) void rate('good')
      if (e.key === 'r') void play(normalRate())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue) return <Shell><p className="text-muted">Montando a fila…</p></Shell>

  if (!card) {
    return (
      <Shell>
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-signal">Sessão concluída</p>
        <h1 className="mt-4 font-display text-4xl">
          {done > 0 ? `${done} ${done === 1 ? 'frase revisada' : 'frases revisadas'}` : 'Nada vencido agora'}
        </h1>
        <p className="mt-3 max-w-sm text-muted">
          {done > 0
            ? 'O agendamento das próximas revisões já foi ajustado.'
            : 'Volte mais tarde ou adicione novas frases ao baralho.'}
        </p>
        <button
          onClick={onDone}
          className="mt-8 rounded-full bg-signal px-6 py-3 font-medium text-ink transition hover:brightness-110"
        >
          Voltar ao início
        </button>
      </Shell>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-8 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onDone} className="hover:text-text">← Sair</button>
        <span>
          {index + 1} / {queue.length}
        </span>
      </header>

      <div className="mt-2 h-[2px] w-full bg-line">
        <div
          className="h-full bg-signal transition-all duration-300"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>

      <main className="flex flex-1 flex-col justify-center py-10">
        <Waveform text={card.sentence} playing={playing} />

        {deck.listenFirst && !revealed ? (
          <p className="mt-8 font-display text-2xl leading-snug text-muted/60">
            Ouça e tente entender. A frase aparece na resposta.
          </p>
        ) : (
          <p className="mt-8 font-display text-3xl leading-snug sm:text-4xl">
            {revealed ? card.sentence : renderCloze(card.sentence, card.clozeRanges)}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <AudioButton onClick={() => play(normalRate())} label="Repetir" />
          <AudioButton onClick={() => play(slowRate())} label="Devagar" />
          <button
            onClick={remove}
            className="ml-auto rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-miss hover:text-miss"
          >
            Excluir
          </button>
        </div>

        <div className="mt-3">
          <VoiceCompare cardId={card.id} sentence={card.sentence} />
        </div>

        {audioError && <p className="mt-4 text-sm text-miss">{audioError}</p>}

        {revealed && (
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-xl text-text/90">{card.translation}</p>
            {card.hints.length > 0 && (
              <ul className="mt-5 space-y-3">
                {card.hints.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted">
                    <span className="mt-[2px] font-mono text-[10px] uppercase tracking-wider text-signal">
                      {hintLabel(h.type)}
                    </span>
                    <span>{h.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      <footer>
        {revealed ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => rate('again')}
              className="rounded-2xl border border-miss/40 bg-miss/10 py-4 font-medium text-miss transition hover:bg-miss/20"
            >
              Errei
            </button>
            <button
              onClick={() => rate('good')}
              className="rounded-2xl border border-hit/40 bg-hit/10 py-4 font-medium text-hit transition hover:bg-hit/20"
            >
              Acertei
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-2xl bg-surface py-4 font-medium transition hover:bg-line"
          >
            Mostrar resposta
          </button>
        )}
      </footer>
    </div>
  )
}

function AudioButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
    >
      {label}
    </button>
  )
}

function hintLabel(t: string) {
  return { phrasal_verb: 'phrasal', false_cognate: 'falso amigo', pronunciation: 'som', custom: 'nota' }[t] ?? 'nota'
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center px-5">{children}</div>
  )
}
