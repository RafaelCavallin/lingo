import { type MarkKind, type Marks } from './textMarks'

const PILL =
  'rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal'

/**
 * A barra só aparece quando há o que fazer — com uma seleção nova, ou com o
 * cursor dentro de uma marca. No resto do tempo fica a linha de dica, para a
 * tela não virar um paredão de botões desabilitados.
 */
export function MarkActions({
  marks,
  allowCloze,
  hasSelection,
  markedKind,
  onAdd,
  onRemove,
  onTranscribe,
  transcribing = false,
}: {
  marks: Marks
  allowCloze: boolean
  hasSelection: boolean
  markedKind: MarkKind | null
  onAdd: (kind: MarkKind) => void
  onRemove: () => void
  onTranscribe?: () => void
  transcribing?: boolean
}) {
  const keepSelection = (e: { preventDefault: () => void }) => e.preventDefault()

  // Altura mínima comum aos três layouts: sem ela, cada seleção no textarea
  // troca de um texto de ~20px para uma linha de botões de ~32px, e o
  // formulário inteiro reflui a cada clique/arraste.
  if (markedKind)
    return (
      <div className="mt-2 min-h-[2rem]">
        <button onMouseDown={keepSelection} onClick={onRemove} className={PILL}>
          {markedKind === 'cloze' ? 'Mostrar de novo' : 'Tirar destaque'}
        </button>
      </div>
    )

  if (hasSelection)
    return (
      <div className="mt-2 flex min-h-[2rem] flex-wrap gap-3">
        {allowCloze && (
          <button onMouseDown={keepSelection} onClick={() => onAdd('cloze')} className={PILL}>
            Ocultar seleção
          </button>
        )}
        <button onMouseDown={keepSelection} onClick={() => onAdd('emphasis')} className={PILL}>
          Destacar seleção
        </button>
        {onTranscribe && (
          <button
            onMouseDown={keepSelection}
            onClick={onTranscribe}
            disabled={transcribing}
            className={`${PILL} disabled:pointer-events-none disabled:opacity-60`}
          >
            {transcribing ? 'Buscando pronúncia…' : 'Adicionar transcrição fonética'}
          </button>
        )}
      </div>
    )

  return <p className="mt-2 flex min-h-[2rem] items-center text-xs text-muted/70">{status(marks, allowCloze)}</p>
}

function status(marks: Marks, allowCloze: boolean): string {
  const counted = summary(marks)
  if (counted) return `${counted} · toque na marca para desfazer`
  return allowCloze
    ? 'Selecione uma palavra para virar lacuna ou destaque'
    : 'Selecione uma palavra para destacá-la'
}

function summary({ cloze, emphasis }: Marks): string {
  const parts: string[] = []
  if (cloze.length) parts.push(`${cloze.length} ${cloze.length === 1 ? 'lacuna' : 'lacunas'}`)
  if (emphasis.length)
    parts.push(`${emphasis.length} ${emphasis.length === 1 ? 'destaque' : 'destaques'}`)
  return parts.join(' e ')
}
