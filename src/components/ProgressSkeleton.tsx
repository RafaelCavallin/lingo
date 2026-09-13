import { MobileNav } from './MobileNav'
import { Skeleton } from './Skeleton'

/** Usada tanto no `Suspense` do chunk de Progresso quanto no `computeStats`
 *  interno da tela — as duas esperas em sequência viram uma só. */
export function ProgressSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        <MobileNav />
      </header>
      <main className="flex-1 py-8" aria-hidden="true">
        <Skeleton shape="text" width="9rem" height="2rem" />
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Skeleton shape="block" height="5.5rem" />
          <Skeleton shape="block" height="5.5rem" />
          <Skeleton shape="block" height="5.5rem" />
        </div>
        <Skeleton shape="block" height="8rem" className="mt-10" />
        <Skeleton shape="block" height="10rem" className="mt-10" />
      </main>
    </div>
  )
}
