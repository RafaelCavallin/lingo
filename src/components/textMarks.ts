export type Range = { start: number; end: number }

export type MarkKind = 'cloze' | 'emphasis'

export type Mark = Range & { kind: MarkKind }

export type Segment = { text: string; start: number; kind: MarkKind | null }

export type Marks = { cloze: Range[]; emphasis: Range[] }

/** Junta lacunas e destaques numa lista única, ordenada pelo início. */
export function marksOf(cloze: Range[] = [], emphasis: Range[] = []): Mark[] {
  return [
    ...cloze.map((r) => ({ ...r, kind: 'cloze' as const })),
    ...emphasis.map((r) => ({ ...r, kind: 'emphasis' as const })),
  ].sort((a, b) => a.start - b.start)
}

/**
 * Fatia o texto pelas marcas. Os offsets são sempre os do texto original —
 * mascarar a lacuna antes de aplicar o destaque deslocaria tudo que vem
 * depois, então as duas marcas são resolvidas na mesma passada.
 */
export function splitByMarks(text: string, marks: Mark[]): Segment[] {
  const out: Segment[] = []
  let cursor = 0
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor) continue // marca sobreposta: a primeira vence
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), start: cursor, kind: null })
    out.push({ text: text.slice(m.start, m.end), start: m.start, kind: m.kind })
    cursor = m.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), start: cursor, kind: null })
  return out
}

function commonPrefix(before: string, after: string): number {
  const limit = Math.min(before.length, after.length)
  let i = 0
  while (i < limit && before[i] === after[i]) i++
  return i
}

function commonSuffix(before: string, after: string, prefix: number): number {
  const limit = Math.min(before.length, after.length) - prefix
  let i = 0
  while (i < limit && before[before.length - 1 - i] === after[after.length - 1 - i]) i++
  return i
}

/**
 * Reposiciona as marcas depois de uma edição do texto. O trecho alterado é o
 * que sobra entre o prefixo e o sufixo comuns: marcas antes dele ficam onde
 * estão, marcas depois andam junto, e marcas que o trecho alterado atravessa
 * são descartadas — o texto que elas marcavam não existe mais.
 */
export function remapRanges(before: string, after: string, ranges: Range[]): Range[] {
  if (before === after) return ranges
  const prefix = commonPrefix(before, after)
  const changedEnd = before.length - commonSuffix(before, after, prefix)
  const delta = after.length - before.length
  return ranges.flatMap((r) => {
    if (r.end <= prefix) return [r]
    if (r.start >= changedEnd) return [{ start: r.start + delta, end: r.end + delta }]
    return []
  })
}

/** O texto que a lacuna mostra no lugar do trecho escondido. */
export function blank(text: string): string {
  return '_'.repeat(Math.max(3, text.length))
}

export function remapMarks(before: string, after: string, marks: Marks): Marks {
  return {
    cloze: remapRanges(before, after, marks.cloze),
    emphasis: remapRanges(before, after, marks.emphasis),
  }
}

/** Encolhe a seleção até os espaços das pontas ficarem de fora. */
export function trimRange(text: string, range: Range): Range {
  const selected = text.slice(range.start, range.end)
  const start = range.start + (selected.length - selected.trimStart().length)
  const end = start + selected.trim().length
  return end > start ? { start, end } : { start: range.start, end: range.start }
}

/**
 * A marca que a seleção pegou, ou `null`. Com o cursor parado (seleção vazia)
 * só conta estar dentro da marca: encostar na borda é o que o usuário faz para
 * continuar digitando ao lado dela.
 */
export function markAt(marks: Mark[], range: Range): Mark | null {
  const empty = range.start === range.end
  const hit = marks.find((m) =>
    empty ? m.start < range.start && range.start < m.end : range.start < m.end && m.start < range.end,
  )
  return hit ?? null
}
