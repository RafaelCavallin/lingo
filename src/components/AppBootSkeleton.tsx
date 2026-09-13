import { HomeSkeleton } from './HomeSkeleton'
import { Skeleton } from './Skeleton'

/**
 * Tela inicial é sempre a Home — mostrar a moldura dela em vez de branco
 * durante o boot do `DeckProvider` faz a transição boot→Home não deslocar
 * um pixel. Ao contrário do estado `'loading'` da própria Home (que já tem
 * header/footer reais em volta), aqui a moldura inteira é falsa: é a única
 * tela que precisa reconstruí-la.
 */
export function AppBootSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-8">
      <p role="status" aria-live="polite" className="sr-only">
        Carregando o Lingo…
      </p>
      <header aria-hidden="true" className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-lg tracking-tight">Lingo</h1>
        <Skeleton shape="pill" width="5.5rem" height="1.5rem" />
      </header>
      <main aria-hidden="true" className="flex flex-1 flex-col justify-center py-14">
        <HomeSkeleton />
      </main>
      <footer aria-hidden="true" className="border-t border-line pt-5">
        <Skeleton shape="text" width="10rem" height="0.75rem" />
      </footer>
    </div>
  )
}
