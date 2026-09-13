import { Skeleton } from './Skeleton'

/** Só o conteúdo do `<main>` da Home — o header e o footer já vêm da própria
 *  tela, para o carregamento interno não empilhar uma segunda página por
 *  cima da que já está montada. */
export function HomeSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton shape="text" width="4rem" height="0.75rem" />
      <Skeleton shape="text" width="6rem" height="4.5rem" className="mt-5" />
      <Skeleton shape="text" width="10rem" height="1.25rem" className="mt-3" />
      <Skeleton shape="pill" width="9rem" height="3.5rem" className="mt-10" />
    </div>
  )
}
