import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeck } from '../contexts/DeckContext'
import { dueCount } from '../services/scheduler'
import type { Deck } from '../services/db'

export function DeckSwitcher({ onClose }: { onClose: () => void }) {
  const { deck, decks, switchDeck, createDeck, renameDeck, removeDeck } = useDeck()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function submitCreate() {
    if (!name.trim()) return
    await createDeck(name)
    setName('')
    setCreating(false)
    onClose()
  }

  async function submitRename(id: string) {
    await renameDeck(id, editName)
    setEditingId(null)
  }

  async function remove(d: Deck) {
    if (decks.length <= 1) {
      alert('Não é possível excluir o único baralho. Crie outro antes.')
      return
    }
    if (!confirm(`Excluir o baralho "${d.name}" e todos os seus cartões? Não tem como desfazer.`)) return
    await removeDeck(d.id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 px-5 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-xs uppercase tracking-wider text-muted">Baralhos</p>

        <ul className="mt-3 space-y-1">
          {decks.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-line/40">
              {editingId === d.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitRename(d.id)}
                  onBlur={() => submitRename(d.id)}
                  className="min-w-0 flex-1 rounded-lg border border-signal bg-transparent px-2 py-1 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => {
                    switchDeck(d.id)
                    onClose()
                  }}
                  className={`min-w-0 flex-1 truncate text-left text-sm ${
                    d.id === deck?.id ? 'font-medium text-signal' : 'text-text'
                  }`}
                >
                  {d.name}
                </button>
              )}
              <DueBadge deckId={d.id} />
              <button
                onClick={() => {
                  setEditingId(d.id)
                  setEditName(d.name)
                }}
                aria-label="Renomear baralho"
                className="shrink-0 font-mono text-[10px] uppercase text-muted hover:text-text"
              >
                editar
              </button>
              <button
                onClick={() => remove(d)}
                aria-label="Excluir baralho"
                className="shrink-0 font-mono text-[10px] uppercase text-muted hover:text-miss"
              >
                excluir
              </button>
            </li>
          ))}
        </ul>

        {creating ? (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
              placeholder="Nome do baralho"
              className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-signal"
            />
            <button onClick={submitCreate} className="shrink-0 rounded-lg bg-signal px-3 py-2 text-sm text-ink">
              Criar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-line py-2 text-sm text-muted transition hover:border-signal hover:text-signal"
          >
            + Novo baralho
          </button>
        )}
      </div>
    </div>
  )
}

function DueBadge({ deckId }: { deckId: string }) {
  const due = useLiveQuery(() => dueCount(deckId), [deckId])
  if (!due) return null
  return <span className="shrink-0 font-mono text-[10px] text-signal">{due}</span>
}
