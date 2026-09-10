import { useState } from 'react'
import { normalRate, speech } from '../services/audio'

/**
 * Pré-escuta da frase no formulário do cartão: o mesmo botão toca e pausa.
 * O áudio é marcado como "preview" para não virar lixo permanente no cache.
 */
export function useSpeechPreview(sentence: string) {
  const [playing, setPlaying] = useState(false)

  async function toggle(): Promise<void> {
    if (playing) {
      speech.stop()
      setPlaying(false)
      return
    }
    setPlaying(true)
    try {
      await speech.speak('preview', sentence, normalRate())
    } finally {
      setPlaying(false)
    }
  }

  return { playing, toggle }
}
