import { useEffect, useState } from 'react'
import {
  canRecord,
  cancelRecording,
  getRecording,
  playRecording,
  startRecording,
  stopPlayback,
  stopRecording,
} from '../services/recorder'
import { speech, normalRate } from '../services/audio'

type Mode = 'idle' | 'recording' | 'has-take'

/**
 * Grave sua leitura e ouça as duas versões em sequência. A comparação é feita
 * de ouvido, sem nota nem pontuação: o objetivo é notar a diferença, não ser avaliado.
 */
export function VoiceCompare({ cardId, sentence }: { cardId: string; sentence: string }) {
  const [mode, setMode] = useState<Mode>('idle')
  const [error, setError] = useState<string | null>(null)
  const [comparing, setComparing] = useState<'native' | 'mine' | null>(null)

  useEffect(() => {
    setMode('idle')
    setError(null)
    setComparing(null)
    getRecording(cardId).then((b) => b && setMode('has-take'))
    return () => {
      cancelRecording()
      stopPlayback()
    }
  }, [cardId])

  async function toggle() {
    setError(null)
    if (mode === 'recording') {
      try {
        await stopRecording(cardId)
        setMode('has-take')
      } catch (e) {
        setMode('idle')
        setError(e instanceof Error ? e.message : 'A gravação falhou.')
      }
      return
    }
    try {
      await startRecording()
      setMode('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gravar.')
    }
  }

  async function compare() {
    setError(null)
    try {
      setComparing('native')
      await speech.speak(cardId, sentence, normalRate())
      setComparing('mine')
      await playRecording(cardId)
    } catch {
      setError('Não foi possível reproduzir a comparação.')
    } finally {
      setComparing(null)
    }
  }

  if (!canRecord()) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={toggle}
        aria-pressed={mode === 'recording'}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-wider transition ${
          mode === 'recording'
            ? 'border-miss bg-miss/15 text-miss'
            : 'border-line text-muted hover:border-signal hover:text-signal'
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            mode === 'recording' ? 'animate-pulse bg-miss' : 'bg-muted'
          }`}
        />
        {mode === 'recording' ? 'Parar' : mode === 'has-take' ? 'Regravar' : 'Gravar minha voz'}
      </button>

      {mode === 'has-take' && (
        <button
          onClick={compare}
          disabled={comparing !== null}
          className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted transition enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-60"
        >
          {comparing === 'native' ? 'Nativo…' : comparing === 'mine' ? 'Você…' : 'Comparar'}
        </button>
      )}

      {error && <span className="w-full text-sm text-miss">{error}</span>}
    </div>
  )
}
