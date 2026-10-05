import { createContext, useContext, type ReactNode } from 'react'

export type Screen =
  | 'home'
  | 'review'
  | 'add'
  | 'import'
  | 'progress'
  | 'settings'
  | 'cards'
  | 'decks'
  | 'account'
  | 'restore'

interface NavigationContextValue {
  /** Tela em exibição — usado pelo menu para destacar o item atual. */
  screen: Screen
  navigate: (screen: Screen) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

/**
 * O "roteador" continua sendo um `useState` no AppShell; este contexto só o
 * torna alcançável de dentro das telas. Sem ele o menu hamburguer precisaria
 * receber sete callbacks por props em cada uma das sete telas.
 */
export function NavigationProvider({
  screen,
  navigate,
  children,
}: NavigationContextValue & { children: ReactNode }) {
  return <NavigationContext.Provider value={{ screen, navigate }}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation precisa estar dentro de <NavigationProvider>')
  return ctx
}
