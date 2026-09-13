import { MobileNav } from './MobileNav'
import { Skeleton, SkeletonLines } from './Skeleton'

/** Usada pelo `Suspense` do chunk de Restaurar — a mesma moldura que a tela
 *  usa no seu próprio estágio `'reading'`, logo depois. */
export function RestoreSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        <MobileNav />
      </header>
      <main className="flex-1 py-8" aria-hidden="true">
        <Skeleton shape="text" width="12rem" height="2rem" />
        <div className="mt-4">
          <SkeletonLines lines={2} lineHeight="0.875rem" />
        </div>
        <Skeleton shape="block" height="9rem" className="mt-8" />
      </main>
    </div>
  )
}
