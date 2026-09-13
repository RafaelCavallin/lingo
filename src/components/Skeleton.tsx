import { skeletonStyle, type SkeletonShape } from './skeleton'

export interface SkeletonProps {
  shape?: SkeletonShape
  width?: string
  height?: string
  className?: string
}

/** Retângulo com a forma do conteúdo final — nunca fala nada por conta própria;
 *  quem anuncia a espera é o `AsyncRegion` que o envolve, ou, nos fluxos de
 *  múltiplos estágios que não usam `AsyncRegion`, a própria tela. */
export function Skeleton({ shape, width, height, className = '' }: SkeletonProps) {
  const style = skeletonStyle({ shape, width, height })
  return (
    <span
      aria-hidden="true"
      className={`inline-block align-middle ${style.className} ${className}`}
      style={{ width: style.width, height: style.height }}
    />
  )
}

export function SkeletonLines({
  lines,
  lineHeight = '1em',
  gap = '0.5rem',
}: {
  lines: number
  lineHeight?: string
  gap?: string
}) {
  return (
    <div aria-hidden="true" className="flex flex-col" style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} shape="text" height={lineHeight} width={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </div>
  )
}
