import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AnkiDeckFile, AnkiNote } from '../services/ankiImport'

/**
 * Mesma tática da tela de Cartões: um .apkg traz milhares de notas e renderizar
 * todas trava o scroll. `content-visibility: auto` deixa o navegador pular o
 * layout das linhas fora da tela, e a lista cresce de 100 em 100.
 */
const ROW_STYLE = { contentVisibility: 'auto', containIntrinsicSize: '0 88px' } as const

const PAGE_SIZE = 100

const ALL_DECKS = ''

/**
 * Escolha manual das notas que entram no Lingo. Nada vem marcado — quem abre
 * esta tela quer trazer uma parte, não o arquivo inteiro (para isso existe o
 * botão de importar tudo).
 */
export function AnkiNotePicker({
  file,
  front,
  back,
  selected,
  setSelected,
  onBack,
  onConfirm,
}: {
  file: AnkiDeckFile
  front: number
  back: number
  /** Vive na tela de importação: voltar do destino não pode perder as marcações. */
  selected: Set<number>
  setSelected: Dispatch<SetStateAction<Set<number>>>
  onBack: () => void
  /** `deckFilter` é o baralho do Anki em foco, se houver — sugestão de nome no destino. */
  onConfirm: (notes: AnkiNote[], deckFilter: string) => void
}) {
  const [query, setQuery] = useState('')
  const [deckFilter, setDeckFilter] = useState(ALL_DECKS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLLIElement>(null)

  // Só as notas que a importação de fato aceita — assim o contador nunca
  // promete mais cartões do que vão entrar.
  const usable = useMemo(
    () =>
      file.notes
        .map((note, index) => ({ note, index }))
        .filter(({ note }) => note.fields[front]?.trim()),
    [file, front],
  )

  const deckCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { note } of usable) counts.set(note.deckName, (counts.get(note.deckName) ?? 0) + 1)
    return counts
  }, [usable])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return usable.filter(({ note }) => {
      if (deckFilter !== ALL_DECKS && note.deckName !== deckFilter) return false
      if (!q) return true
      return (
        (note.fields[front] ?? '').toLowerCase().includes(q) ||
        (note.fields[back] ?? '').toLowerCase().includes(q)
      )
    })
  }, [usable, query, deckFilter, front, back])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, deckFilter])

  const hasMore = visibleCount < filtered.length
  const visible = filtered.slice(0, visibleCount)

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore])

  function toggle(index: number) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  // Com busca ou baralho filtrado, "selecionar todos" age sobre o que está à
  // vista — é o que o usuário está enxergando quando clica.
  function selectFiltered() {
    setSelected((s) => {
      const next = new Set(s)
      for (const { index } of filtered) next.add(index)
      return next
    })
  }

  function confirm() {
    const notes = [...selected].sort((a, b) => a - b).map((i) => file.notes[i])
    onConfirm(notes, deckFilter)
  }

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-wider text-signal">
          {filtered.length} {filtered.length === 1 ? 'nota' : 'notas'} · {selected.size}{' '}
          {selected.size === 1 ? 'selecionada' : 'selecionadas'}
        </p>
        <div className="flex shrink-0 gap-3 font-mono text-xs">
          <button onClick={selectFiltered} className="text-muted transition hover:text-text">
            Selecionar todos
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
            className="text-muted transition hover:text-text disabled:opacity-40 disabled:hover:text-muted"
          >
            Limpar
          </button>
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por frase ou tradução"
        className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-signal"
      />

      {file.deckNames.length > 1 && (
        <select
          value={deckFilter}
          onChange={(e) => setDeckFilter(e.target.value)}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-signal"
        >
          <option value={ALL_DECKS}>Todos os baralhos ({usable.length})</option>
          {file.deckNames.map((name) => (
            <option key={name} value={name}>
              {name} ({deckCounts.get(name) ?? 0})
            </option>
          ))}
        </select>
      )}

      <ul className="mt-6 divide-y divide-line">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-muted">Nenhuma nota bate com o filtro.</p>
        )}
        {visible.map(({ note, index }) => (
          <li key={index} style={ROW_STYLE} className="py-1">
            <label className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={selected.has(index)}
                onChange={() => toggle(index)}
                className="mt-1.5 h-4 w-4 shrink-0 accent-signal"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg leading-snug">{note.fields[front]}</p>
                <p className="mt-1 truncate text-sm text-muted">{note.fields[back] || '—'}</p>
                {file.deckNames.length > 1 && note.deckName && (
                  <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted/60">
                    {note.deckName}
                  </p>
                )}
              </div>
            </label>
          </li>
        ))}
        {hasMore && (
          <li ref={sentinelRef} aria-hidden className="py-4 text-center text-xs text-muted">
            Carregando mais…
          </li>
        )}
      </ul>

      {/* A lista é longa demais para deixar o botão só lá embaixo. */}
      <div className="sticky bottom-0 -mx-5 mt-6 flex items-center gap-4 border-t border-line bg-ink/95 px-5 py-4 backdrop-blur">
        <button onClick={onBack} className="shrink-0 font-mono text-xs text-muted hover:text-text">
          ← Campos
        </button>
        <button
          onClick={confirm}
          disabled={selected.size === 0}
          className="flex-1 rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
        >
          {selected.size === 0
            ? 'Escolha ao menos um cartão'
            : `Escolher destino · ${selected.size} ${selected.size === 1 ? 'frase' : 'frases'}`}
        </button>
      </div>
    </div>
  )
}
