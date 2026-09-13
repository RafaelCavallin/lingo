import type { ReactNode } from 'react'

export interface AsyncRegionProps {
  loading: boolean
  /** Anunciado por leitor de tela enquanto `loading` — gerúndio + reticências. */
  label: string
  skeleton: ReactNode
  children: ReactNode
}

/**
 * Casca de acessibilidade para o par carregando→conteúdo: `aria-busy` no
 * contêiner e uma live region `sr-only` só enquanto `loading`. Serve as telas
 * cujo estado é "um valor ainda não chegou" (Home, Cartões) — fluxos de
 * múltiplos estágios explícitos (Importar, Restaurar, geração de tradução no
 * CardForm) não têm esse formato e anunciam cada estágio por conta própria.
 */
export function AsyncRegion({ loading, label, skeleton, children }: AsyncRegionProps) {
  return (
    <div aria-busy={loading}>
      {loading && (
        <p role="status" aria-live="polite" className="sr-only">
          {label}
        </p>
      )}
      {loading ? skeleton : children}
    </div>
  )
}
