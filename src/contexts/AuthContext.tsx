import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSyncConfigured } from '../services/supabase'
import { completeSignIn, decideOnSignIn, getBoundUserId, type SignInDecision, type SignInPlan } from '../services/auth'
import { syncNow } from '../services/sync'
import { sessionPhase, type SessionPhase } from '../services/sessionPhase'
import { useSignInSettlement } from './useSignInSettlement'

export type AuthActivity = 'idle' | 'signing-in' | 'applying-decision' | 'signing-out'

interface AuthContextValue {
  /** Se o servidor não tem Supabase configurado, a UI de conta nem aparece. */
  configured: boolean
  session: Session | null
  /** Deriva de `session` + o vínculo local — ver `sessionPhase`. Consumida
   *  para nunca mostrar "Entrar"/formulário de login a quem já está logado. */
  phase: SessionPhase
  /** Mantém um botão de ação travado até o fluxo de login terminar de
   *  verdade, não só até a chamada de rede que o iniciou resolver. */
  authActivity: AuthActivity
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
  const [boundUserId, setBoundUserId] = useState<string | null | undefined>(undefined)
  const [restored, setRestored] = useState(false)
  const [authActivity, setAuthActivity] = useState<AuthActivity>('idle')
  const [pendingDecision, setPendingDecision] = useState<SignInDecision | null>(null)
  const pendingUserId = useRef<string | null>(null)
  const listening = useRef(false)
  const { signInSettledAt, userInitiated, settleSignIn } = useSignInSettlement()

  const handleSignedIn = useCallback(
    async (userId: string) => {
      const decision = await decideOnSignIn(userId)
      // A partir daqui a decisão já foi tomada — mesmo que um modal ainda
      // apareça, a chamada de rede que motivava travar o botão terminou.
      setAuthActivity('idle')
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
   * acontecesse antes do efeito de boot rodar. `restored` fecha só depois do
   * `getSession()`, e sempre — em qualquer chamador — para `sessionPhase`
   * nunca ficar presa em "restaurando" se o boot nunca chega a chamar isto.
   */
  const ensureListening = useCallback(async () => {
    const supabase = await getSupabase()
    if (listening.current) return supabase
    listening.current = true
    try {
      const {
        data: { session: current },
      } = await supabase.auth.getSession()
      setSession(current)
      supabase.auth.onAuthStateChange((event, s) => {
        setSession(s)
        if (event === 'SIGNED_IN' && s) void handleSignedIn(s.user.id)
      })
    } finally {
      setRestored(true)
    }
    return supabase
  }, [handleSignedIn])

  useEffect(() => {
    if (!isSyncConfigured()) return
    let cancelled = false
    // Só baixa o supabase-js no boot se este aparelho já usou conta antes —
    // quem nunca fez login não deve pagar esse custo ao abrir o app, e
    // `sessionPhase` usa exatamente este `null` para pular "restaurando".
    void getBoundUserId()
      .then((bound) => {
        if (cancelled) return
        setBoundUserId(bound)
        if (bound) void ensureListening().then(() => syncNow('boot'))
      })
      .catch(() => {
        // Dexie pode rejeitar (upgrade bloqueado por outra aba, quota) — sem
        // isto `boundUserId` ficaria em `undefined` para sempre, e
        // `sessionPhase` presa em "restaurando" sem jamais mostrar "Entrar".
        if (!cancelled) setBoundUserId(null)
      })
    return () => {
      cancelled = true
    }
  }, [ensureListening])

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      userInitiated.current = true
      setAuthActivity('signing-in')
      const supabase = await ensureListening()
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) {
        userInitiated.current = false
        setAuthActivity('idle')
        return { error: error.message, needsConfirmation: false }
      }
      // Com "Confirm email" ligado no projeto, o cadastro não vem com sessão —
      // sem isto a tela voltaria ao formulário em silêncio, como se nada
      // tivesse acontecido. Sem sessão, não há SIGNED_IN agora, então nada mais
      // vai destravar o botão — encerra a atividade aqui.
      if (!data.session) setAuthActivity('idle')
      return { error: null, needsConfirmation: !data.session }
    },
    [ensureListening, userInitiated],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      userInitiated.current = true
      setAuthActivity('signing-in')
      const supabase = await ensureListening()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        userInitiated.current = false
        setAuthActivity('idle')
      }
      // Em caso de sucesso, quem destrava é handleSignedIn — a chamada de
      // rede resolver não significa que o fluxo de login terminou de verdade.
      return { error: error?.message ?? null }
    },
    [ensureListening, userInitiated],
  )

  // Nunca apaga dados locais: o app funciona sem conta, e sair não deveria
  // custar o que foi estudado enquanto ela existia.
  const signOut = useCallback(async () => {
    userInitiated.current = false
    if (!listening.current) return
    setAuthActivity('signing-out')
    try {
      const supabase = await getSupabase()
      await supabase.auth.signOut()
    } finally {
      setAuthActivity('idle')
    }
  }, [userInitiated])

  const resolvePending = useCallback(
    async (plan: SignInPlan) => {
      const userId = pendingUserId.current
      if (!userId) {
        setPendingDecision(null)
        return
      }
      setAuthActivity('applying-decision')
      try {
        await completeSignIn(userId, plan)
      } finally {
        setAuthActivity('idle')
      }
      // Só limpa e fecha o modal depois do wipe/merge ter dado certo — se
      // lançar, o catch de `useAsyncAction` grava o erro, e uma nova
      // tentativa precisa encontrar o mesmo `pendingUserId` de novo.
      pendingUserId.current = null
      setPendingDecision(null)
      if (plan !== 'cancel') void syncNow('signin')
      settleSignIn(plan)
    },
    [settleSignIn],
  )

  const phase = sessionPhase({
    configured: isSyncConfigured(),
    boundUserId,
    restored,
    hasSession: session !== null,
  })

  return (
    <AuthContext.Provider
      value={{
        configured: isSyncConfigured(),
        session,
        phase,
        authActivity,
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
