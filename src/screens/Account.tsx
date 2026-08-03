import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function Account({ onBack }: { onBack: () => void }) {
  const { configured, session, signUp, signIn, signOut } = useAuth()

  if (!configured) {
    return (
      <Shell onBack={onBack}>
        <h1 className="font-display text-3xl">Conta</h1>
        <p className="mt-4 text-muted">Conta e sincronização não estão configuradas neste servidor.</p>
      </Shell>
    )
  }

  if (session) {
    return (
      <Shell onBack={onBack}>
        <h1 className="font-display text-3xl">Conta</h1>
        <p className="mt-4 text-muted">
          Conectado como <span className="text-text">{session.user.email}</span>.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-6 rounded-full border border-line px-5 py-2.5 text-sm transition hover:border-miss hover:text-miss"
        >
          Sair da conta
        </button>
        <p className="mt-4 text-sm text-muted">
          Os dados deste aparelho continuam aqui depois de sair — o app funciona normalmente sem conta.
        </p>
      </Shell>
    )
  }

  return <SignInForm onBack={onBack} signUp={signUp} signIn={signIn} />
}

function SignInForm({
  onBack,
  signUp,
  signIn,
}: {
  onBack: () => void
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    if (mode === 'signup') {
      const result = await signUp(name, email, password)
      setBusy(false)
      if (result.error) setError(result.error)
      else if (result.needsConfirmation) setConfirmationSentTo(email)
      return
    }
    const result = await signIn(email, password)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  if (confirmationSentTo) {
    return (
      <Shell onBack={onBack}>
        <h1 className="font-display text-3xl">Confirme seu email</h1>
        <p className="mt-4 text-muted">
          Enviamos um link de confirmação para <span className="text-text">{confirmationSentTo}</span>.
          Depois de confirmar, volte aqui e entre normalmente.
        </p>
      </Shell>
    )
  }

  return (
    <Shell onBack={onBack}>
      <h1 className="font-display text-3xl">{mode === 'signup' ? 'Criar conta' : 'Entrar'}</h1>
      <p className="mt-3 text-sm text-muted">
        Opcional: só é preciso para sincronizar entre aparelhos. O app continua funcionando sem conta.
      </p>

      <div className="mt-6 space-y-3">
        {mode === 'signup' && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            autoComplete="name"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Senha"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
        />
      </div>

      {error && <p className="mt-3 text-sm text-miss">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || !email.trim() || password.length < 6}
        className="mt-5 w-full rounded-full bg-signal py-3 font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
      >
        {busy ? 'Um instante…' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
      </button>

      <button
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : 'signup')
          setError(null)
        }}
        className="mt-4 text-sm text-muted hover:text-signal"
      >
        {mode === 'signup' ? 'Já tenho conta' : 'Criar uma conta'}
      </button>
    </Shell>
  )
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-14 pt-6">
      <header className="font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
      </header>
      <main className="flex-1 py-8">{children}</main>
    </div>
  )
}
