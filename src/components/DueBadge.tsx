import { dueBadgeView } from './dueBadge'
import { Skeleton } from './Skeleton'

/** Cápsula redonda com o tamanho da fila. Vira skeleton enquanto a contagem
 *  ainda não chegou, e some de vez quando ela chega e é zero — as duas coisas
 *  pareciam iguais antes, e o badge piscava ao surgir do nada. */
export function DueBadge({
  count,
  label,
  className = '',
}: {
  count: number | undefined
  label: string
  className?: string
}) {
  const view = dueBadgeView(count)
  if (view.kind === 'hidden') return null
  if (view.kind === 'placeholder') return <Skeleton shape="circle" height="1.25rem" className={className} />
  return (
    <span
      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-signal px-1.5 font-mono text-[10px] font-medium leading-none tabular-nums text-ink ${className}`}
    >
      <span aria-hidden="true">{view.text}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
