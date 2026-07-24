import { useRef, useState } from 'react'

export type Range = { start: number; end: number }

/** Aplica as lacunas na frase para exibição na revisão. */
export function renderCloze(sentence: string, ranges: Range[] = []): string {
  if (ranges.length === 0) return sentence
  const sorted = [...ranges].sort((a, b) => b.start - a.start)
  let out = sentence
  for (const r of sorted) {
    out = out.slice(0, r.start) + '_'.repeat(Math.max(3, r.end - r.start)) + out.slice(r.end)
  }
  return out
}

/**
 * O usuário seleciona um trecho da frase e toca em "Ocultar".
 * Nada de {{c1::...}}: os offsets são calculados a partir da própria seleção.
 */
export function ClozeEditor({
  sentence,
  ranges,
  onChange,
}: {
  sentence: string
  ranges: Range[]
  onChange: (r: Range[]) => void
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [pending, setPending] = useState<Range | null>(null)

  function onSelect() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !ref.current?.contains(sel.anchorNode)) {
      setPending(null)
      return
    }
    const text = sel.toString()
    const trimmedStart = text.length - text.trimStart().length
    const start = offsetWithin(ref.current, sel.getRangeAt(0)) + trimmedStart
    const end = start + text.trim().length
    if (end > start) setPending({ start, end })
  }

  function hide() {
    if (!pending) return
    const overlapping = ranges.some((r) => pending.start < r.end && r.start < pending.end)
    if (!overlapping) onChange([...ranges, pending].sort((a, b) => a.start - b.start))
    window.getSelection()?.removeAllRanges()
    setPending(null)
  }

  return (
    <div>
      <p
        ref={ref}
        onMouseUp={onSelect}
        onTouchEnd={onSelect}
        className="select-text font-display text-xl leading-relaxed"
      >
        {segments(sentence, ranges).map((s, i) =>
          s.hidden ? (
            <button
              key={i}
              onClick={() => onChange(ranges.filter((r) => r.start !== s.start))}
              title="Toque para mostrar de novo"
              className="rounded bg-signal/20 px-1 text-signal underline decoration-dotted underline-offset-4"
            >
              {s.text}
            </button>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={hide}
          disabled={!pending}
          className="rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-40"
        >
          Ocultar seleção
        </button>
        <span className="text-xs text-muted/70">
          {ranges.length > 0
            ? `${ranges.length} ${ranges.length === 1 ? 'lacuna' : 'lacunas'} · toque para desfazer`
            : 'Selecione uma palavra para transformá-la em lacuna'}
        </span>
      </div>
    </div>
  )
}

function segments(sentence: string, ranges: Range[]) {
  const out: { text: string; hidden: boolean; start: number }[] = []
  let cursor = 0
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start > cursor) out.push({ text: sentence.slice(cursor, r.start), hidden: false, start: cursor })
    out.push({ text: sentence.slice(r.start, r.end), hidden: true, start: r.start })
    cursor = r.end
  }
  if (cursor < sentence.length) out.push({ text: sentence.slice(cursor), hidden: false, start: cursor })
  return out
}

/** Offset da seleção dentro do parágrafo, somando os nós de texto anteriores. */
function offsetWithin(root: HTMLElement, range: globalThis.Range): number {
  const pre = document.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}
