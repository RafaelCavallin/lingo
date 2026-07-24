import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { db, ensureDefaultDeck, type Deck } from './services/db'
import { setSpeechRate, setVoice } from './services/audio'
import { useParameters } from './services/scheduler'
import { Home } from './screens/Home'
import { Review } from './screens/Review'
import { AddCard } from './screens/AddCard'
import { Import } from './screens/Import'
import { Settings } from './screens/Settings'
// Recharts só é baixado por quem abre o progresso — o caminho de estudo fica leve.
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })))

type Screen = 'home' | 'review' | 'add' | 'import' | 'progress' | 'settings'

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [screen, setScreen] = useState<Screen>('home')

  useEffect(() => {
    ensureDefaultDeck().then((d) => {
      setDeck(d)
      // Preferências do baralho valem desde a primeira frase da sessão.
      setVoice(d.voice)
      setSpeechRate(d.speechRate ?? 1)
      useParameters(d.fsrsParams)
    })
    // Pede persistência do IndexedDB: reduz o risco de o navegador limpar os dados.
    void navigator.storage?.persist?.()
  }, [])

  // Ajustes de ritmo feitos em Progresso precisam valer na próxima fila.
  const goHome = useCallback(async () => {
    if (deck) setDeck((await db.decks.get(deck.id)) ?? deck)
    setScreen('home')
  }, [deck])

  if (!deck) return null

  if (screen === 'review') return <Review deck={deck} onDone={goHome} />
  if (screen === 'add') return <AddCard deck={deck} onBack={goHome} />
  if (screen === 'import') return <Import deck={deck} onBack={goHome} />
  if (screen === 'settings') return <Settings deck={deck} onBack={goHome} />
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
    />
  )
}
