import { useState } from 'react'
import { useAsyncAction } from './useAsyncAction'

interface NewDeckFormProps {
  createDeck: (name: string) => Promise<unknown>
  disabled: boolean
}

export function NewDeckForm({ createDeck, disabled }: NewDeckFormProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const action = useAsyncAction(async () => {
    if (!name.trim()) return
    await createDeck(name)
    setName('')
    setCreating(false)
  })
  if (!creating) {
    return (
      <button
        onClick={() => setCreating(true)}
        disabled={disabled}
        className="mt-4 w-full rounded-xl border border-dashed border-line py-3 text-sm text-muted transition hover:border-signal hover:text-signal disabled:opacity-40"
      >
        + Novo baralho
      </button>
    )
  }
  return (
    <div className="mt-4">
      <NewDeckInput name={name} busy={action.busy} onChange={setName} onSubmit={() => void action.run()} />
      {action.error && <p className="mt-3 text-sm text-miss">{action.error}</p>}
    </div>
  )
}

interface NewDeckInputProps {
  name: string
  busy: boolean
  onChange: (name: string) => void
  onSubmit: () => void
}

function NewDeckInput({ name, busy, onChange, onSubmit }: NewDeckInputProps) {
  return (
    <div className="flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        disabled={busy}
        placeholder="Nome do baralho"
        className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-signal disabled:opacity-60"
      />
      <button
        onClick={onSubmit}
        disabled={busy}
        aria-busy={busy}
        className="shrink-0 rounded-lg bg-signal px-3 py-2 text-sm text-ink disabled:opacity-60"
      >
        {busy ? 'Criando…' : 'Criar'}
      </button>
    </div>
  )
}
