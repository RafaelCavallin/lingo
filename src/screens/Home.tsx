import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportBackup, liveCards, type Deck } from '../services/db'
import { buildQueue, estimateMinutes } from '../services/scheduler'
import { Heatmap, iso } from '../components/Heatmap'
import { speech } from '../services/audio'
import { DeckSwitcher } from '../components/DeckSwitcher'

/** Só os primeiros cartões: a home não deve puxar a fila inteira da rede. */
const WARM_ON_HOME = 2

export function Home({
  deck,
  onStudy,
  onAdd,
  onImport,
  onProgress,
  onSettings,
  onCards,
}: {
  deck: Deck
  onStudy: () => void
  onAdd: () => void
  onImport: () => void
  onProgress: () => void
  onSettings: () => void
  onCards: () => void
}) {
  const [queueSize, setQueueSize] = useState<number | null>(null)
  const [minutes, setMinutes] = useState(0)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const total = useLiveQuery(() => liveCards(deck.id).count(), [deck.id])
  const reviewedToday = useLiveQuery(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return db.reviewLogs.where('reviewedAt').above(start.getTime()).count()
  }, [])

  const byDay = useLiveQuery(async () => {
    const logs = await db.reviewLogs.toArray()
    const map = new Map<string, number>()
    for (const l of logs) {
      const k = iso(new Date(l.reviewedAt))
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [reviewedToday])

  useEffect(() => {
    buildQueue(deck).then(async (q) => {
      setQueueSize(q.length)
      // Baixa o áudio das primeiras frases enquanto o usuário ainda está na
      // home: ao tocar em "Estudar" o som já está em disco.
      for (const c of q.slice(0, WARM_ON_HOME)) void speech.warm(c.id, c.sentence)
      setMinutes(await estimateMinutes(q.length))
    })
  }, [deck, reviewedToday, total])

  async function download() {
    const url = URL.createObjectURL(await exportBackup())
    const a = document.createElement('a')
    a.href = url
    a.download = `lingo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const empty = (total ?? 0) === 0
  const hasHistory = (byDay?.size ?? 0) > 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg tracking-tight">Lingo</h1>
        <button
          onClick={() => setSwitcherOpen(true)}
          className="font-mono text-xs text-muted transition hover:text-signal"
        >
          {deck.name} ▾
        </button>
      </header>

      {switcherOpen && <DeckSwitcher onClose={() => setSwitcherOpen(false)} />}

      <main className="flex flex-1 flex-col justify-center py-14">
        {empty ? (
          <>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              Comece colando uma frase que você quer nunca mais esquecer.
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Cada frase vira um cartão narrado em inglês americano. Você revisa quando estiver prestes a esquecer.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={onAdd}
                className="rounded-full bg-signal px-7 py-3.5 font-medium text-ink transition hover:brightness-110"
              >
                Adicionar primeira frase
              </button>
              <button onClick={onImport} className="font-mono text-xs uppercase tracking-wider text-muted hover:text-signal">
                ou importar do Anki
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-signal">Hoje</p>
            <p className="mt-5 font-display text-7xl leading-none tabular-nums sm:text-8xl">
              {queueSize ?? '—'}
            </p>
            <p className="mt-3 text-lg text-muted">
              {queueSize === 1 ? 'frase para revisar' : 'frases para revisar'}
              {queueSize ? ` · cerca de ${minutes} min` : ''}
            </p>

            <button
              onClick={onStudy}
              disabled={!queueSize}
              className="mt-10 self-start rounded-full bg-signal px-8 py-4 text-lg font-medium text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
            >
              {queueSize ? 'Estudar' : 'Nada vencido agora'}
            </button>

            {hasHistory && byDay && (
              <button
                onClick={onProgress}
                aria-label="Ver progresso"
                className="mt-14 rounded-xl border border-transparent p-2 text-left transition hover:border-line"
              >
                <Heatmap counts={byDay} />
                <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted">
                  Ver progresso →
                </span>
              </button>
            )}
          </>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-line pt-5 font-mono text-xs text-muted">
        <div className="flex gap-5">
          <button onClick={onAdd} className="hover:text-signal">+ Frase</button>
          <button onClick={onImport} className="hover:text-signal">Importar</button>
          <button onClick={onCards} className="hover:text-signal">Cartões</button>
          <button onClick={onProgress} className="hover:text-signal">Progresso</button>
          <button onClick={download} className="hover:text-signal">Backup</button>
          <button onClick={onSettings} className="hover:text-signal">Ajustes</button>
        </div>
        <span>
          {total ?? 0} cartões · {reviewedToday ?? 0} hoje
        </span>
      </footer>
    </div>
  )
}
