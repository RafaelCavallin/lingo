import { useLayoutEffect, type RefObject } from 'react'

/** Estica o textarea até caber o texto inteiro, sem barra de rolagem. */
export function growToFit(el: HTMLTextAreaElement | null): void {
  if (!el) return
  el.style.height = 'auto'
  if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`
}

/**
 * Mantém o textarea do tamanho do texto a cada mudança de `value` e de largura
 * da janela. `useLayoutEffect`, não `useEffect`: o crescimento precisa
 * acontecer antes do paint — com `useEffect` dava para ver a caixa com a
 * altura errada por um frame e só então saltar (visível quando o texto chega
 * de um fetch).
 */
export function useGrowToFit(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const grow = () => growToFit(ref.current)
    grow()
    window.addEventListener('resize', grow)
    return () => window.removeEventListener('resize', grow)
  }, [ref, value])
}
