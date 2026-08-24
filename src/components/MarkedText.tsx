import { blank, marksOf, splitByMarks, type Range } from './textMarks'

/**
 * Texto do cartão como ele aparece na revisão: lacunas viram traços enquanto
 * `hideCloze`, destaques ficam em negrito colorido o tempo todo — inclusive
 * antes de revelar a resposta, que é o ponto de marcar a estrutura.
 */
export function MarkedText({
  text,
  cloze,
  emphasis,
  hideCloze = false,
}: {
  text: string
  cloze?: Range[]
  emphasis?: Range[]
  hideCloze?: boolean
}) {
  return (
    <>
      {splitByMarks(text, marksOf(cloze, emphasis)).map((s) => {
        if (s.kind === 'emphasis')
          return (
            <strong key={s.start} className="font-semibold text-signal">
              {s.text}
            </strong>
          )
        if (s.kind === 'cloze' && hideCloze) return <span key={s.start}>{blank(s.text)}</span>
        return <span key={s.start}>{s.text}</span>
      })}
    </>
  )
}
