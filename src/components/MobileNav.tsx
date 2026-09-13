import { useEffect, useRef, useState } from 'react'
import { useNavigation, type Screen } from '../contexts/NavigationContext'
import { useDeck } from '../contexts/DeckContext'
import { useAuth } from '../contexts/AuthContext'
import { displayName } from '../services/auth'
import { DeckSwitcher } from './DeckSwitcher'
import { DueBadge } from './DueBadge'
import { Skeleton } from './Skeleton'
import { useTotalDueCount } from './useDueTick'

const ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Início' },
  { screen: 'add', label: '+ Frase' },
  { screen: 'import', label: 'Importar' },
  { screen: 'cards', label: 'Cartões' },
  { screen: 'progress', label: 'Progresso' },
  { screen: 'settings', label: 'Ajustes' },
]

/**
 * Gatilho ☰ e painel, juntos: cada tela só precisa inserir `<MobileNav />` no
 * seu header. Some a partir de `md` — daí para cima o rodapé de atalhos da Home
 * continua sendo a navegação.
 */
export function MobileNav() {
  const { screen, navigate } = useNavigation()
  const { deck } = useDeck()
  const { configured: syncConfigured, session, phase: authPhase } = useAuth()
  const totalDue = useTotalDueCount()
  const [open, setOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape fecha e o fundo para de rolar enquanto o painel está aberto —
  // o overlay do DeckSwitcher não faz nem um nem outro, mas ali o alvo é
  // pequeno e centralizado; aqui a gaveta cobre a tela inteira.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function go(next: Screen) {
    setOpen(false)
    navigate(next)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-label={totalDue ? 'Abrir menu — há cartões para revisar' : 'Abrir menu'}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="relative -mr-2 shrink-0 self-center p-2 text-muted transition hover:text-signal md:hidden"
      >
        {/* Não há biblioteca de ícones no projeto; três traços à mão. */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="block"
        >
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
        {/* Ponto em vez de número: no ☰ não cabe contagem, e o menu logo abre. */}
        {!!totalDue && totalDue > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-signal" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink/60 md:hidden" onClick={close}>
          {/* `font-body` explícito: o gatilho vive dentro de headers `font-mono`
              em quase todas as telas, e o painel herdaria essa fonte. */}
          <div
            id="mobile-nav"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 flex h-full w-72 max-w-[80%] flex-col overflow-y-auto border-l border-line bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] font-body text-text outline-none"
          >
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-xs uppercase tracking-wider text-muted">Menu</p>
              <button
                onClick={close}
                aria-label="Fechar menu"
                className="-mr-2 p-2 font-mono text-xs text-muted transition hover:text-signal"
              >
                fechar
              </button>
            </div>

            <nav className="mt-4 flex flex-col">
              {ITEMS.map((item) => (
                <button
                  key={item.screen}
                  onClick={() => go(item.screen)}
                  aria-current={screen === item.screen ? 'page' : undefined}
                  className={`rounded-xl px-2 py-3 text-left text-sm transition hover:bg-line/40 ${
                    screen === item.screen ? 'font-medium text-signal' : 'text-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto space-y-1 border-t border-line pt-4">
              {deck && (
                <button
                  onClick={() => {
                    setOpen(false)
                    setSwitcherOpen(true)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-3 text-left transition hover:bg-line/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm text-text">{deck.name}</span>
                    <DueBadge count={totalDue} label={`${totalDue} para revisar em todos os baralhos`} />
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
                    trocar
                  </span>
                </button>
              )}
              {syncConfigured && authPhase === 'restoring' && (
                <div className="px-2 py-3">
                  <Skeleton shape="pill" width="4.5rem" height="1.5rem" />
                </div>
              )}
              {syncConfigured && authPhase !== 'restoring' && (
                <button
                  onClick={() => go('account')}
                  className="w-full truncate rounded-xl px-2 py-3 text-left font-mono text-xs text-muted transition hover:bg-line/40 hover:text-signal"
                >
                  {session ? displayName(session.user) : 'Entrar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fora do painel de propósito: o menu fecha antes, para não empilhar dois overlays z-50. */}
      {switcherOpen && <DeckSwitcher onClose={() => setSwitcherOpen(false)} />}
    </>
  )
}
