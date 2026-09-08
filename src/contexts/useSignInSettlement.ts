import { useCallback, useRef, useState } from 'react'
import type { SignInPlan } from '../services/auth'
import { shouldReturnHome } from '../services/navigationPolicy'

/**
 * Isola o sinal "este login deve devolver o usuário à Home" (RF6-RF10) do
 * resto do AuthContext. `userInitiated` só fica true entre o clique em
 * Entrar/Criar conta e a conclusão desse login — nunca por um SIGNED_IN de
 * restauro de sessão no boot ou reemitido em segundo plano, que não deve
 * arrancar o usuário da tela atual.
 */
export function useSignInSettlement() {
  const [signInSettledAt, setSignInSettledAt] = useState(0)
  const userInitiated = useRef(false)

  // Único ponto que decide se um login concluído devolve o usuário à Home:
  // consome e desliga `userInitiated`, para que uma reemissão posterior de
  // SIGNED_IN não redirecione de novo.
  const settleSignIn = useCallback((plan: SignInPlan | null) => {
    const initiated = userInitiated.current
    userInitiated.current = false
    if (shouldReturnHome({ kind: 'sign-in-settled', userInitiated: initiated, plan })) {
      setSignInSettledAt((n) => n + 1)
    }
  }, [])

  return { signInSettledAt, userInitiated, settleSignIn }
}
