import { Suspense, lazy, useEffect, useState } from 'react'
import { DeckProvider, useDeck } from './contexts/DeckContext'
import { AuthProvider } from './contexts/AuthContext'
import { AccountTransition } from './components/AccountTransition'
import { syncNow } from './services/sync'
import { Home } from './screens/Home'
import { Review } from './screens/Review'
import { AddCard } from './screens/AddCard'
import { Import } from './screens/Import'
import { Settings } from './screens/Settings'
import { Cards } from './screens/Cards'
import { Account } from './screens/Account'
// Recharts só é baixado por quem abre o progresso — o caminho de estudo fica leve.
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })))

type Screen = 'home' | 'review' | 'add' | 'import' | 'progress' | 'settings' | 'cards' | 'account'

export default function App() {
  return (
    <AuthProvider>
      <DeckProvider>
        <AccountTransition />
        <AppShell />
      </DeckProvider>
    </AuthProvider>
  )
}

function AppShell() {
  const { deck, createDeck } = useDeck()
  const [screen, setScreen] = useState<Screen>('home')
  const [newDeckName, setNewDeckName] = useState('')

  useEffect(() => {
    // Pede persistência do IndexedDB: reduz o risco de o navegador limpar os dados.
    void navigator.storage?.persist?.()
  }, [])

  useEffect(() => {
    const handler = () => void syncNow('online')
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [])

  // Fim de qualquer sessão (revisão, cadastro de frase, importação…) é um
  // bom momento oportunista de sincronizar — mais barato que um timer fixo,
  // e não custa nada quando não há conta ou nada mudou.
  const goHome = () => {
    setScreen('home')
    void syncNow('session-end')
  }

  // Só acontece se o usuário excluiu todos os seus baralhos — não é um
  // estado de carregamento. ensureDefaultDeck() nunca recria um sozinho aqui.
  if (!deck) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center px-5">
        <h1 className="font-display text-3xl">Nenhum baralho</h1>
        <p className="mt-3 text-muted">Crie um baralho para começar a estudar.</p>
        <div className="mt-6 flex w-full gap-2">
          <input
            autoFocus
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newDeckName.trim() && createDeck(newDeckName)}
            placeholder="Nome do baralho"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-signal"
          />
          <button
            onClick={() => newDeckName.trim() && createDeck(newDeckName)}
            className="shrink-0 rounded-xl bg-signal px-5 py-3 font-medium text-ink transition hover:brightness-110"
          >
            Criar
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'review') return <Review deck={deck} onDone={goHome} />
  if (screen === 'add') return <AddCard deck={deck} onBack={goHome} />
  if (screen === 'import') return <Import onBack={goHome} />
  if (screen === 'settings')
    return <Settings deck={deck} onBack={goHome} onAccount={() => setScreen('account')} />
  if (screen === 'cards') return <Cards deck={deck} onBack={goHome} />
  if (screen === 'account') return <Account onBack={goHome} />
  if (screen === 'progress')
    return (
      <Suspense fallback={<div className="p-6 font-mono text-xs text-muted">Carregando…</div>}>
        <Progress deck={deck} onBack={goHome} />
      </Suspense>
    )
  return (
    <Home
      deck={deck}
      onStudy={() => setScreen('review')}
      onAdd={() => setScreen('add')}
      onImport={() => setScreen('import')}
      onProgress={() => setScreen('progress')}
      onSettings={() => setScreen('settings')}
      onCards={() => setScreen('cards')}
    />
  )
}
