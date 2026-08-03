import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { db, type Deck } from '../services/db'
import { computeStats, paceAdvice, type Stats } from '../services/stats'
import { Heatmap } from '../components/Heatmap'

export function Progress({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [newPerDay, setNewPerDay] = useState(deck.newCardsPerDay)
  const [youngLimit, setYoungLimit] = useState(deck.youngLimit)

  useEffect(() => {
    computeStats(deck).then(setStats)
  }, [deck])

  async function savePace(next: Partial<Deck>) {
    await db.decks.update(deck.id, { ...next, updatedAt: Date.now() })
  }

  if (!stats) {
    return (
      <Frame onBack={onBack}>
        <p className="text-muted">Somando as revisões…</p>
      </Frame>
    )
  }

  const noData = stats.reviewsTotal === 0

  return (
    <Frame onBack={onBack}>
      <h1 className="font-display text-3xl">Progresso</h1>

      {noData ? (
        <p className="mt-6 max-w-md text-muted">
          Nada para mostrar ainda. Depois da primeira sessão, esta tela passa a exibir sua constância,
          a retenção e a carga das próximas semanas.
        </p>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-3 gap-3">
            <Metric
              label="Retenção 30d"
              value={stats.retention30 === null ? '—' : `${Math.round(stats.retention30 * 100)}%`}
              tone={
                stats.retention30 === null
                  ? 'muted'
                  : stats.retention30 >= 0.85
                    ? 'hit'
                    : stats.retention30 >= 0.8
                      ? 'signal'
                      : 'miss'
              }
            />
            <Metric label="Sequência" value={`${stats.streak}d`} />
            <Metric label="Revisões" value={String(stats.reviewsTotal)} />
          </section>

          <section className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Constância</h2>
            <div className="mt-4">
              <Heatmap counts={stats.byDay} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">
              Próximos 14 dias
            </h2>
            <p className="mt-2 text-sm text-muted">
              Quantas frases vencem por dia, com o agendamento de agora.
            </p>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.forecast} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#9C9BC4', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#32325C' }}
                    tickLine={false}
                    interval={1}
                  />
                  <Tooltip
                    cursor={{ fill: '#32325C40' }}
                    contentStyle={{
                      background: '#1F1F3D',
                      border: '1px solid #32325C',
                      borderRadius: 10,
                      fontSize: 12,
                      color: '#EDEBFF',
                    }}
                    labelStyle={{ color: '#9C9BC4' }}
                    formatter={(v) => [`${v}`, 'frases'] as [string, string]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {stats.forecast.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#F4B740' : '#32325C'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Maturidade</h2>
            <Maturity {...stats.maturity} />
          </section>
        </>
      )}

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Ritmo</h2>
        <p className="mt-2 text-sm text-muted">{paceAdvice(stats, deck)}</p>

        <Slider
          label="Máximo de frases novas por dia"
          value={newPerDay}
          min={5}
          max={60}
          step={5}
          onChange={(v) => {
            setNewPerDay(v)
            void savePace({ newCardsPerDay: v })
          }}
        />
        <Slider
          label="Teto de frases ainda não firmadas"
          value={youngLimit}
          min={20}
          max={200}
          step={10}
          onChange={(v) => {
            setYoungLimit(v)
            void savePace({ youngLimit: v })
          }}
          hint={`Você tem ${stats.youngCount} agora. Novas frases só entram enquanto esse número estiver abaixo do teto.`}
        />
      </section>
    </Frame>
  )
}

function Frame({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
      </header>
      <main className="flex-1 py-8">{children}</main>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'text',
}: {
  label: string
  value: string
  tone?: 'text' | 'hit' | 'signal' | 'miss' | 'muted'
}) {
  const color = { text: 'text-text', hit: 'text-hit', signal: 'text-signal', miss: 'text-miss', muted: 'text-muted' }[tone]
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function Maturity({ mature, young, fresh }: { mature: number; young: number; fresh: number }) {
  const total = mature + young + fresh
  if (total === 0) return null
  const pct = (n: number) => (n / total) * 100
  return (
    <div className="mt-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-line">
        <div style={{ width: `${pct(mature)}%` }} className="bg-hit" />
        <div style={{ width: `${pct(young)}%` }} className="bg-signal" />
        <div style={{ width: `${pct(fresh)}%` }} className="bg-line" />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
        <li><span className="text-hit">■</span> firmes {mature}</li>
        <li><span className="text-signal">■</span> em consolidação {young}</li>
        <li><span className="text-muted">■</span> não vistas {fresh}</li>
      </ul>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between">
        <label className="text-sm text-text/90">{label}</label>
        <span className="font-mono text-sm tabular-nums text-signal">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-signal"
      />
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}
