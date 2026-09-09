/** Cápsula redonda com o tamanho da fila. Some quando não há nada a revisar. */
export function DueBadge({
  count,
  label,
  className = '',
}: {
  count: number
  label: string
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span
      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-signal px-1.5 font-mono text-[10px] font-medium leading-none tabular-nums text-ink ${className}`}
    >
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
