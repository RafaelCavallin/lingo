import { useEffect, useRef, useState } from 'react'
import { type Hint } from '../services/db'
import { listenLabel } from '../services/audioLabels'
import { errorMessageOf } from './asyncAction'
import { enrich, EnrichUnavailable } from '../services/enrich'
import { HintsEditor } from './HintsEditor'
import { MarkableField } from './MarkableField'
import { Skeleton, SkeletonLines } from './Skeleton'
import { type Marks, type Range } from './textMarks'
import { useAsyncAction } from './useAsyncAction'
import { usePhoneticLookup } from './usePhoneticLookup'
import { useSpeechPreview } from './useSpeechPreview'

const NO_MARKS: Marks = { cloze: [], emphasis: [] }

export interface CardFormValues {
  sentence: string
  translation: string
  phonetic: string
  hints: Hint[]
  clozeRanges: Range[]
  emphasisRanges: Range[]
  translationEmphasisRanges: Range[]
}

/**
 * Formulário compartilhado entre criar (AddCard) e editar (EditCard) um
 * cartão. Sem `initial` é o modo de criação: os campos limpam após salvar
 * para a próxima frase. Com `initial` é edição: quem chama decide o que
 * acontece depois do submit (normalmente voltar).
 */
export function CardForm({
  title,
  submitLabel,
  initial,
  onSubmit,
}: {
  title: string
  submitLabel: string
  initial?: CardFormValues
  onSubmit: (values: CardFormValues) => Promise<void>
}) {
  const [sentence, setSentence] = useState(initial?.sentence ?? '')
  const [translation, setTranslation] = useState(initial?.translation ?? '')
  const [phonetic, setPhonetic] = useState(initial?.phonetic ?? '')
  const [hints, setHints] = useState<Hint[]>(initial?.hints ?? [])
  const [marks, setMarks] = useState<Marks>({
    cloze: initial?.clozeRanges ?? [],
    emphasis: initial?.emphasisRanges ?? [],
  })
  const [translationMarks, setTranslationMarks] = useState<Marks>({
    cloze: [],
    emphasis: initial?.translationEmphasisRanges ?? [],
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'manual'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const phoneticLookup = usePhoneticLookup(setPhonetic)
  const preview = useSpeechPreview(sentence)
  // Sair da tela no meio da geração não pode deixar a resposta sobrescrever
  // campos de um formulário que já não existe mais.
  const enrichAbort = useRef<AbortController | null>(null)
  useEffect(() => () => enrichAbort.current?.abort(), [])

  const generating = status === 'loading'
  const ready =
    sentence.trim().length > 0 &&
    translation.trim().length > 0 &&
    phoneticLookup.status !== 'loading' &&
    !generating

  async function generate() {
    if (!sentence.trim()) return
    setStatus('loading')
    setNotice(null)
    const controller = new AbortController()
    enrichAbort.current = controller
    try {
      const result = await enrich(sentence.trim(), controller.signal)
      // Tradução nova, offsets antigos: os destaques dela não valem mais.
      setTranslation(result.translation)
      setTranslationMarks(NO_MARKS)
      if (result.phonetic) setPhonetic(result.phonetic)
      // Dicas escritas por você nunca são sobrescritas pela geração.
      setHints((prev) => [...prev.filter((h) => h.source === 'user'), ...result.hints])
      setStatus('idle')
    } catch (e) {
      if (controller.signal.aborted) return
      setStatus(e instanceof EnrichUnavailable ? 'manual' : 'idle')
      setNotice(errorMessageOf(e, 'Não foi possível gerar agora.'))
    }
  }

  const submitAction = useAsyncAction(async () => {
    await onSubmit({
      sentence,
      translation,
      phonetic,
      hints,
      clozeRanges: marks.cloze,
      emphasisRanges: marks.emphasis,
      translationEmphasisRanges: translationMarks.emphasis,
    })
    setNotice(null)
    if (!initial) {
      setSentence('')
      setTranslation('')
      setPhonetic('')
      setHints([])
      setMarks(NO_MARKS)
      setTranslationMarks(NO_MARKS)
    }
  })

  return (
    <>
      <main className="flex-1 py-10">
        <h1 className="font-display text-3xl">{title}</h1>

        <label className="mt-8 block font-mono text-xs uppercase tracking-wider text-muted">
          Frase em inglês
        </label>
        <div className="mt-2">
          <MarkableField
            value={sentence}
            onChange={setSentence}
            marks={marks}
            onMarksChange={setMarks}
            onBlur={() => status === 'idle' && !translation && generate()}
            placeholder="I'm looking forward to seeing you again."
            textClassName="font-display text-xl"
            onTranscribe={(text) => void phoneticLookup.lookup(text, sentence)}
            transcribing={phoneticLookup.status === 'loading'}
          />
        </div>

        {sentence.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button
              onClick={() => void preview.toggle()}
              className="font-mono text-xs uppercase tracking-wider text-muted hover:text-signal"
            >
              {listenLabel(preview.phase)}
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="font-mono text-xs uppercase tracking-wider text-signal disabled:text-muted"
            >
              {generating ? 'Gerando…' : '↻ Gerar tradução e dicas'}
            </button>
          </div>
        )}

        {generating && (
          <p role="status" aria-live="polite" className="sr-only">
            Gerando tradução e dicas…
          </p>
        )}
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
        {phoneticLookup.notice && <p className="mt-3 text-sm text-muted">{phoneticLookup.notice}</p>}

        <label className="mt-8 block font-mono text-xs uppercase tracking-wider text-muted">
          Tradução
        </label>
        <div className="mt-2">
          {generating && !translation.trim() ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <SkeletonLines lines={2} lineHeight="1.25rem" />
            </div>
          ) : (
            <MarkableField
              value={translation}
              onChange={setTranslation}
              marks={translationMarks}
              onMarksChange={setTranslationMarks}
              allowCloze={false}
              placeholder={
                status === 'manual'
                  ? 'Estou ansioso para ver você de novo.'
                  : 'Gerada ao sair do campo acima — edite à vontade.'
              }
              textClassName="text-lg"
            />
          )}
        </div>

        <label className="mt-8 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted">
          Fonética
          {phoneticLookup.status === 'loading' && (
            <span className="normal-case tracking-normal text-signal animate-pulse">
              buscando pronúncia…
            </span>
          )}
        </label>
        {generating && !phonetic ? (
          <Skeleton shape="block" height="3.25rem" className="mt-2 w-full" />
        ) : (
          <input
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
            disabled={phoneticLookup.status === 'loading'}
            placeholder="ˈbərd(ə)n"
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 font-mono text-lg text-signal outline-none placeholder:text-muted/40 focus:border-signal disabled:opacity-60"
          />
        )}

        <HintsEditor hints={hints} onChange={setHints} loading={generating} />
      </main>

      <button
        onClick={() => void submitAction.run()}
        disabled={!ready || submitAction.busy}
        aria-busy={submitAction.busy}
        className="w-full rounded-2xl bg-signal py-4 font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
      >
        {submitAction.busy ? 'Salvando…' : submitLabel}
      </button>
      {submitAction.error && <p className="mt-3 text-sm text-miss">{submitAction.error}</p>}
    </>
  )
}
