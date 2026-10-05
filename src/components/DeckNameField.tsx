interface DeckNameFieldProps {
  name: string
  active: boolean
  editValue: string | null
  disabled: boolean
  onOpen: () => void
  onEditChange: (value: string) => void
  onCommit: () => void
}

export function DeckNameField({ name, active, editValue, disabled, onOpen, onEditChange, onCommit }: DeckNameFieldProps) {
  if (editValue === null) {
    return (
      <button
        onClick={onOpen}
        className={`block max-w-full truncate text-left font-display text-lg ${active ? 'text-signal' : 'text-text'}`}
      >
        {name}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={editValue}
      onChange={(e) => onEditChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onCommit()}
      onBlur={onCommit}
      disabled={disabled}
      aria-label="Novo nome do baralho"
      className="w-full rounded-lg border border-signal bg-transparent px-2 py-1 outline-none disabled:opacity-60"
    />
  )
}
