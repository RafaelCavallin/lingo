import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSyncConfigured } from '../services/supabase'
import { completeSignIn, decideOnSignIn, getBoundUserId, type SignInDecision, type SignInPlan } from '../services/auth'
import { syncNow } from '../services/sync'
import { useSignInSettlement } from './useSignInSettlement'

interface AuthContextValue {
  /** Se o servidor não tem Supabase configurado, a UI de conta nem aparece. */
  configured: boolean
  session: Session | null
  /** `null` quando não há decisão pendente de mesclar/descartar dados locais. */
  pendingDecision: SignInDecision | null
  /** Muda a cada login concluído que deve devolver o usuário à Home (ver navigationPolicy). */
  signInSettledAt: number
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resolvePending: (plan: SignInPlan) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [pendingDecision, setPendingDecision] = useState<SignInDecision | null>(null)
  const pendingUserId = useRef<string | null>(null)
  const listening = useRef(false)
  const { signInSettledAt, userInitiated, settleSignIn } = useSignInSettlement()

  const handleSignedIn = useCallback(
    async (userId: string) => {
      const decision = await decideOnSignIn(userId)
      if (decision.kind === 'resume') {
        void syncNow('signin')
        settleSignIn(null)
        return
      }
      if (decision.kind === 'auto-adopt') {
        await completeSignIn(userId, 'merge')
        void syncNow('signin')
        settleSignIn(null)
        return
      }
      // needs-prompt / account-switch: só sincroniza (e só decide o redirect)
      // depois que o usuário escolher mesclar ou descartar em resolvePending —
      // sincronizar antes empurraria dados que a decisão ainda pode apagar.
      pendingUserId.current = userId
      setPendingDecision(decision)
    },
    [settleSignIn],
  )

  /**
   * Idempotente e compartilhada entre o restauro de sessão no boot e as ações
   * de login/cadastro: sem isso, o app teria dois pontos assinando
   * onAuthStateChange, um deles perdido sempre que o primeiro sign-in
   * acontecesse antes do efeito de boot rodar.
   */
  const ensureListening = useCallback(async () => {
    const supabase = await getSupabase()
    if (listening.current) return supabase
    listening.current = true
    const {
      data: { session: current },
    } = await supabase.auth.getSession()
    setSession(current)
    supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && s) void handleSignedIn(s.user.id)
    })
    return supabase
  }, [handleSignedIn])

  useEffect(() => {
    if (!isSyncConfigured()) return
    let cancelled = false
    // Só baixa o supabase-js no boot se este aparelho já usou conta antes —
    // quem nunca fez login não deve pagar esse custo ao abrir o app.
    void getBoundUserId().then((bound) => {
      if (bound && !cancelled) void ensureListening().then(() => syncNow('boot'))
    })
    return () => {
      cancelled = true
    }
  }, [ensureListening])

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      userInitiated.current = true
      const supabase = await ensureListening()
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) {
        userInitiated.current = false
        return { error: error.message, needsConfirmation: false }
      }
      // Com "Confirm email" ligado no projeto, o cadastro não vem com sessão —
      // sem isto a tela voltaria ao formulário em silêncio, como se nada
      // tivesse acontecido. Sem sessão, não há SIGNED_IN agora — deixa
      // `userInitiated` ligado até a confirmação trazer um SIGNED_IN de verdade.
      return { error: null, needsConfirmation: !data.session }
    },
    [ensureListening, userInitiated],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      userInitiated.current = true
      const supabase = await ensureListening()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) userInitiated.current = false
      return { error: error?.message ?? null }
    },
    [ensureListening, userInitiated],
  )

  // Nunca apaga dados locais: o app funciona sem conta, e sair não deveria
  // custar o que foi estudado enquanto ela existia.
  const signOut = useCallback(async () => {
    userInitiated.current = false
    if (!listening.current) return
    const supabase = await getSupabase()
    await supabase.auth.signOut()
  }, [userInitiated])

  const resolvePending = useCallback(
    async (plan: SignInPlan) => {
      const userId = pendingUserId.current
      setPendingDecision(null)
      pendingUserId.current = null
      if (!userId) return
      await completeSignIn(userId, plan)
      if (plan !== 'cancel') void syncNow('signin')
      settleSignIn(plan)
    },
    [settleSignIn],
  )

  return (
    <AuthContext.Provider
      value={{
        configured: isSyncConfigured(),
        session,
        pendingDecision,
        signInSettledAt,
        signUp,
        signIn,
        signOut,
        resolvePending,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
