import { useEffect, useRef, useState } from 'react'
import { MarkActions } from './MarkActions'
import { MarkBackdrop } from './MarkBackdrop'
import { markAt, marksOf, remapMarks, trimRange, type MarkKind, type Marks, type Range } from './textMarks'

const BOX = 'whitespace-pre-wrap break-words px-4 py-3 leading-relaxed'

/**
 * O campo onde a frase é escrita e marcada ao mesmo tempo. Quem desenha as
 * lacunas e destaques é a camada de trás; o `<textarea>` por cima continua
 * sendo o campo de verdade (cursor, teclado do celular, corretor). Por isso a
 * camada de trás não pode mudar métrica nenhuma do texto — só moldura, fundo e
 * sublinhado —, senão as marcas saem de cima das palavras.
 */
export function MarkableField({
  value,
  onChange,
  marks,
  onMarksChange,
  allowCloze = true,
  placeholder,
  onBlur,
  textClassName,
  onTranscribe,
  transcribing = false,
}: {
  value: string
  onChange: (text: string) => void
  marks: Marks
  onMarksChange: (marks: Marks) => void
  allowCloze?: boolean
  placeholder?: string
  onBlur?: () => void
  textClassName: string
  onTranscribe?: (text: string) => void
  transcribing?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<Range | null>(null)

  useEffect(() => {
    const grow = () => growToFit(ref.current)
    grow()
    window.addEventListener('resize', grow)
    return () => window.removeEventListener('resize', grow)
  }, [value])

  const all = marksOf(marks.cloze, marks.emphasis)
  const marked = selection ? markAt(all, selection) : null
  const pending = selection && !marked && selection.end > selection.start ? selection : null

  function edit(text: string) {
    onChange(text)
    onMarksChange(remapMarks(value, text, marks))
  }

  function readSelection() {
    const el = ref.current
    if (!el) return
    setSelection(trimRange(value, { start: el.selectionStart, end: el.selectionEnd }))
  }

  function add(kind: MarkKind) {
    if (!pending) return
    onMarksChange({ ...marks, [kind]: [...marks[kind], pending].sort((a, b) => a.start - b.start) })
    ref.current?.setSelectionRange(pending.end, pending.end)
    setSelection(null)
  }

  function remove() {
    if (!marked) return
    const kept = marks[marked.kind].filter((r) => r.start !== marked.start)
    onMarksChange({ ...marks, [marked.kind]: kept })
    setSelection(null)
  }

  return (
    <div>
      <div className="relative rounded-xl border border-line bg-surface focus-within:border-signal">
        <MarkBackdrop text={value} marks={all} className={`${BOX} ${textClassName}`} />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => edit(e.target.value)}
          onSelect={readSelection}
          onBlur={() => {
            setSelection(null)
            onBlur?.()
          }}
          rows={2}
          placeholder={placeholder}
          className={`${BOX} ${textClassName} relative block w-full resize-none overflow-hidden bg-transparent outline-none selection:bg-signal/30 placeholder:text-muted/40`}
        />
      </div>

      <MarkActions
        marks={marks}
        allowCloze={allowCloze}
        hasSelection={pending !== null}
        markedKind={marked?.kind ?? null}
        onAdd={add}
        onRemove={remove}
        onTranscribe={
          pending && onTranscribe ? () => onTranscribe(value.slice(pending.start, pending.end)) : undefined
        }
        transcribing={transcribing}
      />
    </div>
  )
}

function growToFit(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`
}
