import { State } from 'ts-fsrs'
import { db, type Deck } from './db'
import { iso } from '../components/Heatmap'

export interface Stats {
  retention30: number | null
  reviews30: number
  reviewsTotal: number
  streak: number
  byDay: Map<string, number>
  forecast: { day: string; count: number }[]
  maturity: { mature: number; young: number; fresh: number }
  youngCount: number
}

const DAY = 86_400_000

export async function computeStats(deck: Deck): Promise<Stats> {
  const [logs, cards] = await Promise.all([
    db.reviewLogs.toArray(),
    db.cards.where('deckId').equals(deck.id).toArray(),
  ])

  const byDay = new Map<string, number>()
  for (const l of logs) {
    const k = iso(new Date(l.reviewedAt))
    byDay.set(k, (byDay.get(k) ?? 0) + 1)
  }

  const cutoff = Date.now() - 30 * DAY
  const recent = logs.filter((l) => l.reviewedAt >= cutoff)
  const retention30 = recent.length
    ? recent.filter((l) => l.rating === 'good').length / recent.length
    : null

  // Carga futura: quantos cartões vencem em cada um dos próximos 14 dias.
  const forecast: { day: string; count: number }[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    const from = start.getTime() + i * DAY
    const to = from + DAY
    const count = cards.filter(
      (c) => c.state !== State.New && c.due >= (i === 0 ? 0 : from) && c.due < to,
    ).length
    forecast.push({
      day: i === 0 ? 'hoje' : new Date(from).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count,
    })
  }

  const learning = cards.filter((c) => c.state === State.Learning || c.state === State.Relearning)
  const review = cards.filter((c) => c.state === State.Review)
  const maturity = {
    mature: review.filter((c) => c.stability >= 21).length,
    young: review.filter((c) => c.stability < 21).length + learning.length,
    fresh: cards.filter((c) => c.state === State.New).length,
  }

  return {
    retention30,
    reviews30: recent.length,
    reviewsTotal: logs.length,
    streak: currentStreak(byDay),
    byDay,
    forecast,
    maturity,
    youngCount: maturity.young,
  }
}

/** Dias seguidos de estudo. O dia de hoje ainda em branco não quebra a sequência. */
function currentStreak(byDay: Map<string, number>): number {
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!byDay.get(iso(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (byDay.get(iso(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * Leitura do ritmo atual, para o ajuste do limite inteligente.
 * A faixa saudável de retenção com FSRS gira em torno de 0,85–0,92.
 */
export function paceAdvice(s: Stats, deck: Deck): string {
  if (s.reviews30 < 30) return 'Poucas revisões ainda para uma leitura confiável do ritmo.'
  if (s.retention30 !== null && s.retention30 < 0.8)
    return 'Retenção abaixo de 80%: reduzir o teto de cartões novos costuma estabilizar antes de aumentar o volume.'
  if (s.youngCount >= deck.youngLimit)
    return 'O teto de cartões novos está segurando a entrada — sinal de que os atuais ainda não firmaram. É esperado.'
  if (s.retention30 !== null && s.retention30 > 0.93 && s.youngCount < deck.youngLimit * 0.6)
    return 'Retenção alta e folga na fila: dá para subir o teto diário sem sobrecarregar.'
  return 'Ritmo equilibrado. Mantenha como está.'
}
