import { useRef } from 'react'
import { type Hint, type HintType } from '../services/db'
import { SkeletonLines } from './Skeleton'
import { useGrowToFit } from './useGrowToFit'

const HINT_OPTIONS: { value: HintType; label: string }[] = [
  { value: 'phrasal_verb', label: 'Phrasal verb' },
  { value: 'idiom', label: 'Idiom' },
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
          <SkeletonLines lines={2} lineHeight="6.75rem" gap="1rem" />
        </div>
      )}
      {hints.length === 0 && !loading && (
        <p className="mt-3 text-sm text-muted/70">
          Nenhuma dica ainda. Elas chegam com a geração, e você ajusta ou escreve as suas.
        </p>
      )}
      {hints.length > 0 && (
        <ul className="mt-3 space-y-4">
          {hints.map((h, i) => (
            <HintRow
              key={i}
              hint={h}
              onChange={(changes) => update(i, changes)}
              onRemove={() => onChange(hints.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
    </>
  )
}


/** Uma dica: tipo e remover em cima, o texto embaixo na largura toda,
 *  crescendo com o que for escrito. */
function HintRow({
  hint,
  onChange,
  onRemove,
}: {
  hint: Hint
  onChange: (changes: Partial<Hint>) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useGrowToFit(ref, hint.text)

  return (
    <li>
      <div className="flex items-center justify-between">
        <select
          value={hint.type}
          onChange={(e) => onChange({ type: e.target.value as HintType })}
          aria-label="Tipo da dica"
          className="rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-xs text-muted outline-none focus:border-signal"
        >
          {HINT_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button onClick={onRemove} aria-label="Remover dica" className="px-2 text-lg text-muted hover:text-miss">
          ×
        </button>
      </div>
      <textarea
        ref={ref}
        value={hint.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        placeholder="look forward to = aguardar ansiosamente"
        className="mt-2 block w-full resize-none overflow-hidden rounded-lg border border-line bg-surface px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-muted/40 focus:border-signal"
      />
    </li>
  )
}
