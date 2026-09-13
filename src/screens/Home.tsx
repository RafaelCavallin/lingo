import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { db, liveCards, type Deck } from '../services/db'
import { buildQueue, estimateMinutes } from '../services/scheduler'
import { iso } from '../components/Heatmap'
import { speech } from '../services/audio'
import { AsyncRegion } from '../components/AsyncRegion'
import { DeckSwitcher } from '../components/DeckSwitcher'
import { DueBadge } from '../components/DueBadge'
import { useDueTick, useTotalDueCount } from '../components/useDueTick'
import { useLastDefined } from '../components/useLastDefined'
import { usePendingIndicator } from '../components/usePendingIndicator'
import { MobileNav } from '../components/MobileNav'
import { HomeSkeleton } from '../components/HomeSkeleton'
import { HomeToday } from '../components/HomeToday'
import { HomeOnboarding } from '../components/HomeOnboarding'
import { Skeleton } from '../components/Skeleton'
import { homeView } from '../components/homeSummary'
import { useAuth } from '../contexts/AuthContext'
import { displayName } from '../services/auth'
import type { SessionPhase } from '../services/sessionPhase'

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
  const { configured: syncConfigured, phase: authPhase, session } = useAuth()
  const [queueSize, setQueueSize] = useState<number | null>(null)
  const [minutes, setMinutes] = useState(0)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const tick = useDueTick()
  // Soma de todos os baralhos: o número gigante é só o baralho ativo, e o
  // badge existe justamente para revelar o que está pendente fora dele.
  const totalDue = useTotalDueCount()
  // Um cartão só precisa ser aquecido uma vez; sem isto o relógio reenviaria
  // o mesmo áudio para o /api/tts a cada meio minuto.
  const warmed = useRef(new Set<string>())
  const lastDeckId = useRef(deck.id)

  const totalRaw = useLiveQuery(() => liveCards(deck.id).count(), [deck.id])
  // Chaveado pelo baralho: sem isto, trocar para um baralho vazio mostraria
  // por um instante a contagem do baralho anterior, em vez do skeleton.
  const { value: total } = useLastDefined(totalRaw, deck.id)
  const reviewedTodayRaw = useLiveQuery(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return db.reviewLogs.where('reviewedAt').above(start.getTime()).count()
  }, [])
  const { value: reviewedToday } = useLastDefined(reviewedTodayRaw)

  const byDayRaw = useLiveQuery(async () => {
    const logs = await db.reviewLogs.toArray()
    const map = new Map<string, number>()
    for (const l of logs) {
      const k = iso(new Date(l.reviewedAt))
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [reviewedTodayRaw])
  const { value: byDay, firstLoad: byDayLoading } = useLastDefined(byDayRaw)

  useEffect(() => {
    // Só reseta o número ao trocar de baralho de verdade — nas outras
    // dependências (revisão feita, tick de 30s) ele fica parado no valor
    // anterior até o novo chegar, para não piscar a cada recontagem.
    if (lastDeckId.current !== deck.id) {
      lastDeckId.current = deck.id
      setQueueSize(null)
    }
    void buildQueue(deck).then(async (q) => {
      setQueueSize(q.length)
      // Baixa o áudio das primeiras frases enquanto o usuário ainda está na
      // home: ao tocar em "Estudar" o som já está em disco.
      for (const c of q.slice(0, WARM_ON_HOME)) {
        if (warmed.current.has(c.id)) continue
        warmed.current.add(c.id)
        void speech.warm(c.id, c.sentence)
      }
      setMinutes(await estimateMinutes(q.length))
    })
  }, [deck, reviewedTodayRaw, totalRaw, tick])

  const view = homeView({ total, queueSize, minutes })
  // Sem a antipiscada, o primeiro frame antes da leitura do Dexie resolver
  // mostraria o skeleton por um instante mesmo em leituras rapidíssimas.
  const showLoading = usePendingIndicator(view.kind === 'loading')

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-lg tracking-tight">Lingo</h1>
        {/* Abaixo de md estes dois controles vivem dentro do menu hamburguer. */}
        <div className="hidden min-w-0 items-baseline gap-4 md:flex">
          <button
            onClick={() => setSwitcherOpen(true)}
            className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted transition hover:text-signal"
          >
            <DueBadge
              count={totalDue}
              label={`${totalDue ?? 0} para revisar em todos os baralhos`}
              className="-translate-y-1"
            />
            <span className="truncate">{deck.name} ▾</span>
          </button>
          {/* O login vivia escondido dentro de Ajustes; aqui ele fica a um toque
              em qualquer sessão, sem competir com o botão de estudar. */}
          {syncConfigured && <AccountControl phase={authPhase} session={session} onAccount={onAccount} />}
        </div>
        <MobileNav />
      </header>

      {switcherOpen && <DeckSwitcher onClose={() => setSwitcherOpen(false)} />}

      <main className="flex flex-1 flex-col justify-center py-14">
        <AsyncRegion loading={showLoading} label="Carregando seus cartões…" skeleton={<HomeSkeleton />}>
          {view.kind === 'onboarding' && <HomeOnboarding onAdd={onAdd} onImport={onImport} />}
          {view.kind === 'today' && (
            <HomeToday
              queueSize={view.queueSize}
              minutes={view.minutes}
              onStudy={onStudy}
              byDay={byDay}
              byDayLoading={byDayLoading}
              onProgress={onProgress}
            />
          )}
        </AsyncRegion>
      </main>

      {/* Os seis atalhos em linha só cabem a partir de md; abaixo disso quem
          navega é o menu hamburguer e aqui fica só o resumo do dia. */}
      <footer className="flex items-center justify-between gap-5 border-t border-line pt-5 font-mono text-xs text-muted">
        <nav className="hidden gap-5 md:flex">
          <FooterLink onClick={onAdd}>+ Frase</FooterLink>
          <FooterLink onClick={onImport}>Importar</FooterLink>
          <FooterLink onClick={onCards}>Cartões</FooterLink>
          <FooterLink onClick={onProgress}>Progresso</FooterLink>
          <FooterLink onClick={onSettings}>Ajustes</FooterLink>
        </nav>
        {total === undefined ? (
          <Skeleton shape="text" width="7rem" height="1rem" />
        ) : (
          <span className="whitespace-nowrap">
            {total} cartões · {reviewedToday ?? 0} hoje
          </span>
        )}
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

/** Nunca mostra "Entrar" para quem já está logado: `phase === 'restoring'`
 *  cobre exatamente a janela em que a sessão ainda está voltando. */
function AccountControl({
  phase,
  session,
  onAccount,
}: {
  phase: SessionPhase
  session: Session | null
  onAccount: () => void
}) {
  if (phase === 'restoring') return <Skeleton shape="pill" width="4.5rem" height="1.5rem" />
  if (session) {
    return (
      <button
        onClick={onAccount}
        title={session.user.email}
        aria-label={`Conta de ${session.user.email}`}
        className="shrink-0 truncate font-mono text-xs text-muted transition hover:text-signal"
      >
        {displayName(session.user)}
      </button>
    )
  }
  return (
    <button
      onClick={onAccount}
      className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
    >
      Entrar
    </button>
  )
}
