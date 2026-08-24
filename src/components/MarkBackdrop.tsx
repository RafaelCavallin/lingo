import { splitByMarks, type Mark, type MarkKind } from './textMarks'

const SEGMENT: Record<MarkKind, string> = {
  cloze: 'rounded bg-signal/10 ring-1 ring-inset ring-signal/60',
  emphasis: 'underline decoration-signal decoration-2 underline-offset-4',
}

/** A camada que pinta as marcas atrás do texto do campo. */
export function MarkBackdrop({
  text,
  marks,
  className,
}: {
  text: string
  marks: Mark[]
  className: string
}) {
  return (
    <div aria-hidden className={`${className} pointer-events-none absolute inset-0 text-transparent`}>
      {splitByMarks(text, marks).map((s) => (
        <span key={s.start} className={s.kind ? SEGMENT[s.kind] : undefined}>
          {s.text}
        </span>
      ))}
    </div>
  )
}
