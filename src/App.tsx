import { Suspense, lazy, useEffect, useState } from 'react'
import { DeckProvider, useDeck } from './contexts/DeckContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NavigationProvider, type Screen } from './contexts/NavigationContext'
import { AccountTransition } from './components/AccountTransition'
import { syncNow } from './services/sync'
import { primeAudio } from './services/audioPrime'
import { Home } from './screens/Home'
import { Review } from './screens/Review'
import { AddCard } from './screens/AddCard'
import { Import } from './screens/Import'
import { Settings } from './screens/Settings'
import { Cards } from './screens/Cards'
import { Account } from './screens/Account'
import { NoDeck } from './screens/NoDeck'
// Recharts só é baixado por quem abre o progresso — o caminho de estudo fica leve.
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })))
// Restaurar é raro e traz o JSZip junto: fica fora do carregamento inicial.
const Restore = lazy(() => import('./screens/Restore').then((m) => ({ default: m.Restore })))

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
  const { signInSettledAt } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')

  useEffect(() => {
    // Pede persistência do IndexedDB: reduz o risco de o navegador limpar os dados.
    void navigator.storage?.persist?.()
    primeAudio()
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

  // `signInSettledAt` só muda quando o AuthContext decidiu que este login
  // (iniciado pelo usuário, e já sem decisão pendente de dados) deve
  // devolver o usuário à Home (RF6-RF10). O valor inicial 0 nunca dispara
  // este efeito, porque a dependência não muda entre montagem e primeiro
  // render. Reimplementa o corpo de `goHome` em vez de depender dela: sua
  // referência muda a cada render e entraria em loop se fosse dependência.
  useEffect(() => {
    if (signInSettledAt === 0) return
    setScreen('home')
    void syncNow('session-end')
  }, [signInSettledAt])

  // Voltar para a Home continua sendo o fim de sessão (e o gatilho do sync);
  // pular direto de Cartões para Ajustes pelo menu, não.
  const navigate = (next: Screen) => (next === 'home' ? goHome() : setScreen(next))

  // Só acontece se o usuário excluiu todos os seus baralhos — não é um
  // estado de carregamento. ensureDefaultDeck() nunca recria um sozinho aqui.
  if (!deck) {
    return <NoDeck createDeck={createDeck} onDeckCreated={goHome} />
  }

  const renderScreen = () => {
    if (screen === 'review') return <Review deck={deck} onDone={goHome} />
    if (screen === 'add') return <AddCard deck={deck} onBack={goHome} />
    if (screen === 'import') return <Import onBack={goHome} />
    if (screen === 'settings')
      return <Settings deck={deck} onBack={goHome} onAccount={() => setScreen('account')} />
    if (screen === 'cards') return <Cards deck={deck} onBack={goHome} />
    if (screen === 'account') return <Account onBack={goHome} />
    if (screen === 'restore')
      return (
        <Suspense fallback={<div className="p-6 font-mono text-xs text-muted">Carregando…</div>}>
          <Restore onBack={goHome} />
        </Suspense>
      )
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
        onAccount={() => setScreen('account')}
      />
    )
  }

  return (
    <NavigationProvider screen={screen} navigate={navigate}>
      {renderScreen()}
    </NavigationProvider>
  )
}
