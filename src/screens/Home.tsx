import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, downloadBackup, liveCards, type Deck } from '../services/db'
import { buildQueue, estimateMinutes } from '../services/scheduler'
import { Heatmap, iso } from '../components/Heatmap'
import { speech } from '../services/audio'
import { DeckSwitcher } from '../components/DeckSwitcher'
import { MobileNav } from '../components/MobileNav'
import { useAuth } from '../contexts/AuthContext'
import { displayName } from '../services/auth'

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
  onAccount,
}: {
  deck: Deck
  onStudy: () => void
  onAdd: () => void
  onImport: () => void
  onProgress: () => void
  onSettings: () => void
  onCards: () => void
  onAccount: () => void
}) {
  const { configured: syncConfigured, session } = useAuth()
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
    void buildQueue(deck).then(async (q) => {
      setQueueSize(q.length)
      // Baixa o áudio das primeiras frases enquanto o usuário ainda está na
      // home: ao tocar em "Estudar" o som já está em disco.
      for (const c of q.slice(0, WARM_ON_HOME)) void speech.warm(c.id, c.sentence)
      setMinutes(await estimateMinutes(q.length))
    })
  }, [deck, reviewedToday, total])

  const empty = (total ?? 0) === 0
  const hasHistory = (byDay?.size ?? 0) > 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-lg tracking-tight">Lingo</h1>
        {/* Abaixo de md estes dois controles vivem dentro do menu hamburguer. */}
        <div className="hidden min-w-0 items-baseline gap-4 md:flex">
          <button
            onClick={() => setSwitcherOpen(true)}
            className="truncate font-mono text-xs text-muted transition hover:text-signal"
          >
            {deck.name} ▾
          </button>
          {/* O login vivia escondido dentro de Ajustes; aqui ele fica a um toque
              em qualquer sessão, sem competir com o botão de estudar. */}
          {syncConfigured &&
            (session ? (
              <button
                onClick={onAccount}
                title={session.user.email}
                aria-label={`Conta de ${session.user.email}`}
                className="shrink-0 truncate font-mono text-xs text-muted transition hover:text-signal"
              >
                {displayName(session.user)}
              </button>
            ) : (
              <button
                onClick={onAccount}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
              >
                Entrar
              </button>
            ))}
        </div>
        <MobileNav />
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

      {/* Os seis atalhos em linha só cabem a partir de md; abaixo disso quem
          navega é o menu hamburguer e aqui fica só o resumo do dia. */}
      <footer className="flex items-center justify-between gap-5 border-t border-line pt-5 font-mono text-xs text-muted">
        <nav className="hidden gap-5 md:flex">
          <FooterLink onClick={onAdd}>+ Frase</FooterLink>
          <FooterLink onClick={onImport}>Importar</FooterLink>
          <FooterLink onClick={onCards}>Cartões</FooterLink>
          <FooterLink onClick={onProgress}>Progresso</FooterLink>
          <FooterLink onClick={() => void downloadBackup()}>Backup</FooterLink>
          <FooterLink onClick={onSettings}>Ajustes</FooterLink>
        </nav>
        <span className="whitespace-nowrap">
          {total ?? 0} cartões · {reviewedToday ?? 0} hoje
        </span>
      </footer>
    </div>
  )
}

function FooterLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button onClick={onClick} className="whitespace-nowrap text-left transition hover:text-signal">
      {children}
    </button>
  )
}
