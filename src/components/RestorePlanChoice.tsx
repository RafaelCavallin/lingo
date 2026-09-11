import type { RestorePlan } from '../services/backupRestore'

export function RestorePlanChoice({
  value,
  current,
  onSelect,
}: {
  value: RestorePlan
  current: RestorePlan
  onSelect: (plan: RestorePlan) => void
}) {
  const copy = TEXTS[value]
  return (
    <label
      className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
        current === value ? 'border-signal bg-signal/10' : 'border-line hover:border-signal/50'
      }`}
    >
      <input
        type="radio"
        name="plano-de-restauracao"
        checked={current === value}
        onChange={() => onSelect(value)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-medium">{copy.label}</span>
        <span className="mt-1 block text-sm text-muted">{copy.hint}</span>
      </span>
    </label>
  )
}

const TEXTS: Record<RestorePlan, { label: string; hint: string }> = {
  merge: {
    label: 'Mesclar com o que já está aqui',
    hint: 'Mantém o que for mais recente dos dois lados. Nada é apagado.',
  },
  replace: {
    label: 'Substituir tudo pelo backup',
    hint: 'Descarta os cartões e baralhos que não estão no arquivo. O histórico de revisões é preservado.',
  },
}
