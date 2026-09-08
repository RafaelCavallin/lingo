import { useState } from 'react'
import type { Deck } from '../services/db'
import { shouldReturnHome } from '../services/navigationPolicy'

interface NoDeckProps {
  createDeck: (name: string) => Promise<Deck>
  onDeckCreated: () => void
}

/**
 * Só acontece se o usuário excluiu todos os seus baralhos — não é um estado
 * de carregamento. Sair daqui tem destino único: a Home (RF1-RF3), seja qual
 * for a tela que estava pendente antes deste estado aparecer. Falha de
 * gravação local mantém a tela e o texto digitado, com a causa comunicada.
 */
export function NoDeck({ createDeck, onDeckCreated }: NoDeckProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    try {
      await createDeck(name)
    } catch {
      setError('Não foi possível criar o baralho. Tente de novo.')
      return
    }
    if (shouldReturnHome({ kind: 'deck-created' })) onDeckCreated()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center px-5">
      <h1 className="font-display text-3xl">Nenhum baralho</h1>
      <p className="mt-3 text-muted">Crie um baralho para começar a estudar.</p>
      <div className="mt-6 flex w-full gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          placeholder="Nome do baralho"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-signal"
        />
        <button
          onClick={() => void handleCreate()}
          className="shrink-0 rounded-xl bg-signal px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          Criar
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-miss">{error}</p>}
    </div>
  )
}
