import { useMemo } from 'react'

/**
 * Traço da frase: cada barra corresponde a uma palavra, com altura derivada
 * do seu tamanho. É estável para a mesma frase, então a onda vira uma
 * assinatura reconhecível do cartão. Preenche conforme o áudio avança.
 */
export function Waveform({ text, playing }: { text: string; playing: boolean }) {
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

  return (
    <div
      className="flex h-12 items-center gap-[3px]"
      role="img"
      aria-label={`Onda sonora da frase, ${wordCount} palavras`}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] flex-1 rounded-full transition-colors duration-300 ${
            playing ? 'bg-signal' : 'bg-line'
          }`}
          style={{
            height: `${Math.round(h * 100)}%`,
            animation: playing ? `pulse 900ms ease-in-out ${i * 45}ms infinite alternate` : undefined,
          }}
        />
      ))}
      <style>{`@keyframes pulse { from { transform: scaleY(0.72) } to { transform: scaleY(1) } }`}</style>
    </div>
  )
}
