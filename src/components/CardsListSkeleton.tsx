import { Skeleton } from './Skeleton'

const ROWS = 6

/** Mesma altura de linha que a lista de cartões reserva para cada item de
 *  verdade — a lista não muda de tamanho quando os dados chegam. */
export function CardsListSkeleton() {
  return (
    <ul aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: ROWS }, (_, i) => (
        <li key={i} className="flex items-start gap-3 py-4">
          <Skeleton shape="block" width="1rem" height="1rem" className="mt-1.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton shape="text" width="70%" height="1.25rem" />
            <Skeleton shape="text" width="50%" height="0.875rem" className="mt-2" />
          </div>
        </li>
      ))}
    </ul>
  )
}
