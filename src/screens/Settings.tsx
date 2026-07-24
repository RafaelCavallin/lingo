import { useEffect, useState } from 'react'
import { db, MAX_RATE, MIN_RATE, VOICES, type Deck } from '../services/db'
import { setVoice, setSpeechRate, speech, normalRate } from '../services/audio'
import { lastSyncAt, setSyncKey, sync, syncKey, SyncNotConfigured } from '../services/sync'
import { MIN_REVIEWS, NotEnoughData, optimize, reviewCount } from '../services/optimizer'

const SAMPLE = 'This is how your sentences will sound.'

export function Settings({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [voice, setLocalVoice] = useState(deck.voice)
  const [rate, setRate] = useState(deck.speechRate)
  const [listenFirst, setListenFirst] = useState(deck.listenFirst)
  const [key, setKey] = useState(syncKey())
  const [syncState, setSyncState] = useState<{ busy: boolean; message: string | null; tone: 'ok' | 'bad' | null }>({
    busy: false,
    message: null,
    tone: null,
  })
  const [reviews, setReviews] = useState(0)
  const [optState, setOptState] = useState<{ busy: boolean; message: string | null; tone: 'ok' | 'bad' | null }>({
    busy: false,
    message: null,
    tone: null,
  })

  useEffect(() => {
    reviewCount().then(setReviews)
  }, [])

  async function chooseVoice(v: string) {
    setLocalVoice(v)
    setVoice(v)
    await db.decks.update(deck.id, { voice: v, updatedAt: Date.now() })
    void speech.speak('preview', SAMPLE, normalRate())
  }

  /** Salva ao soltar o slider, não a cada pixel arrastado. */
  async function commitRate(v: number) {
    setSpeechRate(v)
    await db.decks.update(deck.id, { speechRate: v, updatedAt: Date.now() })
    void speech.speak('preview', SAMPLE, v)
  }

  async function toggleListenFirst(v: boolean) {
    setListenFirst(v)
    await db.decks.update(deck.id, { listenFirst: v, updatedAt: Date.now() })
  }

  async function runSync() {
    setSyncState({ busy: true, message: null, tone: null })
    setSyncKey(key)
    try {
      const r = await sync()
      setSyncState({
        busy: false,
        tone: 'ok',
        message:
          r.pulled > 0
            ? `Sincronizado. ${r.pulled} ${r.pulled === 1 ? 'revisão veio' : 'revisões vieram'} do outro aparelho.`
            : 'Sincronizado. Nada de novo do outro lado.',
      })
    } catch (e) {
      setSyncState({
        busy: false,
        tone: 'bad',
        message:
          e instanceof SyncNotConfigured
            ? e.message
            : e instanceof Error
              ? e.message
              : 'A sincronização falhou.',
      })
    }
  }

  async function runOptimize() {
    setOptState({ busy: true, message: null, tone: null })
    try {
      await optimize(deck)
      setOptState({
        busy: false,
        tone: 'ok',
        message: 'Parâmetros atualizados. Os novos intervalos valem a partir da próxima revisão de cada frase.',
      })
    } catch (e) {
      setOptState({
        busy: false,
        tone: 'bad',
        message: e instanceof NotEnoughData || e instanceof Error ? e.message : 'A otimização falhou.',
      })
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
      </header>

      <main className="flex-1 py-8">
        <h1 className="font-display text-3xl">Ajustes</h1>

        <Section title="Voz">
          <p className="text-sm text-muted">
            Todas com sotaque americano. Trocar a voz regenera a narração na próxima vez que cada
            frase aparecer — o áudio antigo continua salvo, mas deixa de ser usado.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => chooseVoice(v.id)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  voice === v.id
                    ? 'border-signal bg-signal/10'
                    : 'border-line bg-surface hover:border-muted'
                }`}
              >
                <span className="block font-medium">{v.label}</span>
                <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">
                  {v.note}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Velocidade">
          <p className="text-sm text-muted">
            Vale para a narração automática do cartão. O botão <span className="text-text">Devagar</span>{' '}
            continua sendo 30% mais lento que este valor, seja ele qual for.
          </p>

          <div className="mt-5 flex items-baseline justify-between">
            <label htmlFor="rate" className="text-sm text-text/90">
              Velocidade padrão
            </label>
            <span className="font-mono text-sm tabular-nums text-signal">{rate.toFixed(2)}×</span>
          </div>
          <input
            id="rate"
            type="range"
            min={MIN_RATE}
            max={MAX_RATE}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            onPointerUp={() => commitRate(rate)}
            onKeyUp={() => commitRate(rate)}
            className="mt-3 w-full accent-signal"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
            <span>pausado</span>
            <span>natural</span>
          </div>

          <button
            onClick={() => speech.speak('preview', SAMPLE, rate)}
            className="mt-4 rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
          >
            ▸ Ouvir amostra
          </button>
        </Section>

        <Section title="Modo de estudo">
          <Toggle
            label="Ouvir primeiro"
            checked={listenFirst}
            onChange={toggleListenFirst}
            hint="A frase escrita fica escondida até você responder. Treina compreensão de ouvido, sem a muleta do texto."
          />
        </Section>

        <Section title="Sincronizar aparelhos">
          <p className="text-sm text-muted">
            Use a mesma frase-chave nos dois aparelhos. Ela não sai daqui: o servidor guarda apenas
            o hash. Frases, dicas e histórico sobem; áudio não — a narração é regenerada do outro lado.
          </p>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="frase-chave com pelo menos 8 caracteres"
            className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-3 font-mono text-sm outline-none placeholder:text-muted/40 focus:border-signal"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              onClick={runSync}
              disabled={syncState.busy || key.trim().length < 8}
              className="rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
            >
              {syncState.busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
            {lastSyncAt() > 0 && (
              <span className="font-mono text-xs text-muted">
                última vez: {new Date(lastSyncAt()).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
          <Message state={syncState} />
        </Section>

        <Section title="Otimizar agendamento">
          <p className="text-sm text-muted">
            Reaprende os parâmetros do FSRS a partir do seu histórico, em vez dos padrões. Roda no
            próprio aparelho e pode levar alguns minutos.
          </p>
          <p className="mt-3 font-mono text-xs text-muted">
            {reviews} revisões acumuladas · mínimo de {MIN_REVIEWS}
            {deck.paramsOptimizedAt
              ? ` · otimizado em ${new Date(deck.paramsOptimizedAt).toLocaleDateString('pt-BR')}`
              : ' · nunca otimizado'}
          </p>
          <button
            onClick={runOptimize}
            disabled={optState.busy || reviews < MIN_REVIEWS}
            className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm transition enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-50"
          >
            {optState.busy ? 'Otimizando…' : 'Otimizar com meu histórico'}
          </button>
          <Message state={optState} />
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-8 first:border-0">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-1 h-6 w-11 shrink-0 rounded-full p-[3px] transition ${
          checked ? 'bg-signal' : 'bg-line'
        }`}
      >
        <span
          className={`block h-[18px] w-[18px] rounded-full bg-ink transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      </span>
    </label>
  )
}

function Message({ state }: { state: { message: string | null; tone: 'ok' | 'bad' | null } }) {
  if (!state.message) return null
  return (
    <p className={`mt-3 text-sm ${state.tone === 'bad' ? 'text-miss' : 'text-hit'}`}>{state.message}</p>
  )
}
