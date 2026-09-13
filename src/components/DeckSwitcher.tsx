import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeck } from '../contexts/DeckContext'
import { queueCount } from '../services/scheduler'
import { DueBadge } from './DueBadge'
import { useAsyncAction } from './useAsyncAction'
import { useDueTick } from './useDueTick'
import { useLastDefined } from './useLastDefined'
import type { Deck } from '../services/db'

export function DeckSwitcher({ onClose }: { onClose: () => void }) {
  const { deck, decks, switchDeck, createDeck, renameDeck, removeDeck } = useDeck()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const createAction = useAsyncAction(async () => {
    if (!name.trim()) return
    await createDeck(name)
    setName('')
    setCreating(false)
    onClose()
  })

  const renameAction = useAsyncAction(async (id: string) => {
    await renameDeck(id, editName)
    setEditingId(null)
  })

  const removeAction = useAsyncAction(async (d: Deck) => {
    if (decks.length <= 1) {
      alert('Não é possível excluir o único baralho. Crie outro antes.')
      return
    }
    if (!confirm(`Excluir o baralho "${d.name}" e todos os seus cartões? Não tem como desfazer.`)) return
    await removeDeck(d.id)
  })

  // Uma única lista, então uma ação em voo (criar/renomear/excluir) trava as
  // outras — evita, por exemplo, excluir um segundo baralho enquanto o
  // primeiro ainda está sendo removido.
  const anyBusy = createAction.busy || renameAction.busy || removeAction.busy

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-switcher-title"
      aria-busy={anyBusy}
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 px-5 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="deck-switcher-title" className="font-mono text-xs uppercase tracking-wider text-muted">
          Baralhos
        </p>

        <ul className="mt-3 space-y-1">
          {decks.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-line/40">
              {editingId === d.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void renameAction.run(d.id)}
                  onBlur={() => void renameAction.run(d.id)}
                  disabled={anyBusy}
                  className="min-w-0 flex-1 rounded-lg border border-signal bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-60"
                />
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    onClick={() => {
                      switchDeck(d.id)
                      onClose()
                    }}
                    className={`min-w-0 truncate text-left text-sm ${
                      d.id === deck?.id ? 'font-medium text-signal' : 'text-text'
                    }`}
                  >
                    {d.name}
                  </button>
                  <DeckDueBadge deck={d} />
                </div>
              )}
              <button
                onClick={() => {
                  setEditingId(d.id)
                  setEditName(d.name)
                }}
                disabled={anyBusy}
                aria-label="Renomear baralho"
                className="shrink-0 font-mono text-[10px] uppercase text-muted hover:text-text disabled:opacity-40"
              >
                editar
              </button>
              <button
                onClick={() => void removeAction.run(d)}
                disabled={anyBusy}
                aria-label="Excluir baralho"
                aria-busy={removeAction.busy}
                className="shrink-0 font-mono text-[10px] uppercase text-muted hover:text-miss disabled:opacity-40"
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
              onKeyDown={(e) => e.key === 'Enter' && void createAction.run()}
              disabled={createAction.busy}
              placeholder="Nome do baralho"
              className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-signal disabled:opacity-60"
            />
            <button
              onClick={() => void createAction.run()}
              disabled={createAction.busy}
              aria-busy={createAction.busy}
              className="shrink-0 rounded-lg bg-signal px-3 py-2 text-sm text-ink disabled:opacity-60"
            >
              {createAction.busy ? 'Criando…' : 'Criar'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            disabled={anyBusy}
            className="mt-3 w-full rounded-xl border border-dashed border-line py-2 text-sm text-muted transition hover:border-signal hover:text-signal disabled:opacity-40"
          >
            + Novo baralho
          </button>
        )}

        {(createAction.error ?? renameAction.error ?? removeAction.error) && (
          <p className="mt-3 text-sm text-miss">
            {createAction.error ?? renameAction.error ?? removeAction.error}
          </p>
        )}
      </div>
    </div>
  )
}

function DeckDueBadge({ deck }: { deck: Deck }) {
  const tick = useDueTick()
  const count = useLiveQuery(() => queueCount(deck), [deck, tick])
  const { value } = useLastDefined(count)
  return <DueBadge count={value} label={`${value ?? 0} para revisar`} />
}
