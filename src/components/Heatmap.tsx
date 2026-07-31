import { useMemo } from 'react'

const CELL = 11
const GAP = 3
const WEEKS = 40
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * Constância dos últimos 10 meses. Sem lib de gráfico: é uma grade de retângulos,
 * e escrevê-la à mão custa menos que a dependência.
 */
export function Heatmap({ counts }: { counts: Map<string, number> }) {
  const { cells, monthMarks, max } = useMemo(() => build(counts), [counts])

  const width = WEEKS * (CELL + GAP)
  const height = 7 * (CELL + GAP) + 16

  return (
    <figure className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Revisões por dia nos últimos 10 meses. Melhor dia: ${max} revisões.`}
        className="min-w-full"
      >
        {monthMarks.map((m) => (
          <text
            key={m.label + m.x}
            x={m.x}
            y={10}
            className="fill-muted font-mono"
            style={{ fontSize: 9 }}
          >
            {m.label}
          </text>
        ))}
        {cells.map((c) => (
          <rect
            key={c.key}
            x={c.x}
            y={c.y + 16}
            width={CELL}
            height={CELL}
            rx={2.5}
            fill={color(c.count, max)}
          >
            <title>
              {c.count === 0
                ? `${c.label}: sem revisões`
                : `${c.label}: ${c.count} ${c.count === 1 ? 'revisão' : 'revisões'}`}
            </title>
          </rect>
        ))}
      </svg>
    </figure>
  )
}

function color(count: number, max: number): string {
  if (count === 0) return '#232343'
  const t = Math.min(1, count / Math.max(4, max))
  // Do azul da interface até o âmbar do sinal, conforme a carga do dia.
  if (t < 0.34) return '#5A4F63'
  if (t < 0.67) return '#A8823F'
  return '#F4B740'
}

function build(counts: Map<string, number>) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Começa no domingo da semana mais antiga exibida.
  const start = new Date(today)
  start.setDate(start.getDate() - (WEEKS - 1) * 7 - today.getDay())

  const cells: { key: string; x: number; y: number; count: number; label: string }[] = []
  const monthMarks: { label: string; x: number }[] = []
  let lastMonth = -1
  let max = 0

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      if (date > today) continue

      const key = iso(date)
      const count = counts.get(key) ?? 0
      max = Math.max(max, count)

      if (d === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth()
        monthMarks.push({ label: MONTHS[lastMonth], x: w * (CELL + GAP) })
      }

      cells.push({
        key,
        x: w * (CELL + GAP),
        y: d * (CELL + GAP),
        count,
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      })
    }
  }

  return { cells, monthMarks, max }
}

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
