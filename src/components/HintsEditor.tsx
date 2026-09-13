import { type Hint, type HintType } from '../services/db'
import { SkeletonLines } from './Skeleton'

const HINT_TYPES: { value: HintType; label: string }[] = [
  { value: 'phrasal_verb', label: 'Phrasal verb' },
  { value: 'false_cognate', label: 'Falso amigo' },
  { value: 'pronunciation', label: 'Pronúncia' },
  { value: 'custom', label: 'Nota' },
]

/** Lista de dicas do cartão: as geradas chegam prontas, as suas você escreve. */
export function HintsEditor({
  hints,
  onChange,
  loading = false,
}: {
  hints: Hint[]
  onChange: (hints: Hint[]) => void
  /** Geração em voo e a lista ainda vazia — mostra o formato final em vez do
   *  aviso de "nenhuma dica ainda", que salta de ~20px para ~180px de uma vez. */
  loading?: boolean
}) {
  function update(index: number, changes: Partial<Hint>) {
    onChange(hints.map((h, i) => (i === index ? { ...h, ...changes, source: 'user' } : h)))
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-muted">Dicas</span>
        <button
          onClick={() => onChange([...hints, { type: 'custom', text: '', source: 'user' }])}
          className="font-mono text-xs text-signal hover:brightness-110"
        >
          + adicionar
        </button>
      </div>

      {hints.length === 0 && loading && (
        <div className="mt-3">
          <SkeletonLines lines={2} lineHeight="2.25rem" gap="0.75rem" />
        </div>
      )}
      {hints.length === 0 && !loading && (
        <p className="mt-3 text-sm text-muted/70">
          Nenhuma dica ainda. Elas chegam com a geração, e você ajusta ou escreve as suas.
        </p>
      )}
      {hints.length > 0 && (
        <ul className="mt-3 space-y-3">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2">
              <select
                value={h.type}
                onChange={(e) => update(i, { type: e.target.value as HintType })}
                className="rounded-lg border border-line bg-surface px-2 py-2 font-mono text-xs text-muted outline-none focus:border-signal"
              >
                {HINT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={h.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder="look forward to = aguardar ansiosamente"
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
              />
              <button
                onClick={() => onChange(hints.filter((_, j) => j !== i))}
                aria-label="Remover dica"
                className="px-2 text-muted hover:text-miss"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

