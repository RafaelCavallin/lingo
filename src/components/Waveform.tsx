import { useMemo } from 'react'

type Phase = 'idle' | 'loading' | 'playing'

/** `loading` é a busca do áudio (rede/cache); `playing` só liga quando o som já está saindo. */
const PHASE_LABEL: Record<Phase, string> = { idle: 'parada', loading: 'carregando', playing: 'tocando' }
const PHASE_BAR_CLASS: Record<Phase, string> = { idle: 'bg-line', loading: 'bg-line/60', playing: 'bg-signal' }
const PHASE_KEYFRAME: Record<Phase, string | undefined> = { idle: undefined, loading: 'fade', playing: 'pulse' }

function phaseOf(playing: boolean, loading: boolean): Phase {
  if (playing) return 'playing'
  if (loading) return 'loading'
  return 'idle'
}

/**
 * Traço da frase: cada barra corresponde a uma palavra, com altura derivada
 * do seu tamanho. É estável para a mesma frase, então a onda vira uma
 * assinatura reconhecível do cartão. Preenche conforme o áudio avança.
 */
export function Waveform({
  text,
  playing,
  loading = false,
}: {
  text: string
  playing: boolean
  loading?: boolean
}) {
  const bars = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean)
    const seed = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7)
    return words.flatMap((w, i) => {
      const base = Math.min(1, w.length / 9)
      const wobble = ((seed + i * 37) % 23) / 60
      return [0.35 + base * 0.5 + wobble, 0.55 + base * 0.45 - wobble / 2, 0.3 + base * 0.4]
    })
  }, [text])

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const phase = phaseOf(playing, loading)
  const keyframe = PHASE_KEYFRAME[phase]

  return (
    <div
      className="flex h-12 items-center gap-[3px]"
      role="img"
      aria-label={`Onda sonora da frase, ${wordCount} palavras, ${PHASE_LABEL[phase]}`}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] flex-1 rounded-full transition-colors duration-300 ${PHASE_BAR_CLASS[phase]}`}
          style={{
            height: `${Math.round(h * 100)}%`,
            animation: keyframe ? `${keyframe} 900ms ease-in-out ${i * 45}ms infinite alternate` : undefined,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse { from { transform: scaleY(0.72) } to { transform: scaleY(1) } }
        @keyframes fade { from { opacity: 0.35 } to { opacity: 0.8 } }
      `}</style>
    </div>
  )
}
