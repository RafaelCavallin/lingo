import { useState } from 'react'
import { normalRate, speech } from '../services/audio'
import type { ListenPhase } from '../services/audioLabels'

/**
 * Pré-escuta da frase no formulário do cartão: o mesmo botão toca e pausa. O
 * `onStart` de `speech.speak` (ver services/audio.ts) é o que separa "buscando
 * o áudio" de "tocando" — sem ele o botão dizia "Pausar" durante todo o fetch
 * do TTS, até 8s. O áudio é marcado como "preview" para não virar lixo
 * permanente no cache.
 */
export function useSpeechPreview(sentence: string) {
  const [phase, setPhase] = useState<ListenPhase>('idle')

  async function toggle(): Promise<void> {
    if (phase !== 'idle') {
      speech.stop()
      setPhase('idle')
      return
    }
    setPhase('loading')
    try {
      await speech.speak('preview', sentence, normalRate(), () => setPhase('playing'))
    } finally {
      setPhase('idle')
    }
  }

  return { phase, toggle }
}
