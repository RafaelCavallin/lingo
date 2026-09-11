import type { ReactNode } from 'react'

/** Peças visuais compartilhadas pela tela de Ajustes e pelas seções que ela
 *  compõe — `components/` não pode importar de `screens/`. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-8 first:border-0">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-1 h-6 w-11 shrink-0 rounded-full p-[3px] transition ${
          checked ? 'bg-signal' : 'bg-line'
        }`}
      >
        <span
          className={`block h-[18px] w-[18px] rounded-full bg-ink transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      </span>
    </label>
  )
}

export function Message({ state }: { state: { message: string | null; tone: 'ok' | 'bad' | null } }) {
  if (!state.message) return null
  return (
    <p className={`mt-3 text-sm ${state.tone === 'bad' ? 'text-miss' : 'text-hit'}`}>{state.message}</p>
  )
}
