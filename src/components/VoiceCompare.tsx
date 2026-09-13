import { useEffect, useRef, useState } from 'react'
import { errorMessageOf } from './asyncAction'
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
  // `getUserMedia` pode ficar minutos esperando o usuário responder ao prompt
  // de permissão do navegador — sem isto o botão ficava inerte e clicável de
  // novo, abrindo um segundo pedido por cima do primeiro.
  const [pending, setPending] = useState(false)
  // Guarda de qual cartão é a chamada em voo: sem isto, um `getUserMedia`
  // pendente do cartão anterior resolveria depois da troca e mexeria no
  // `pending`/`mode` do cartão novo, que já pode ter sua própria ação em voo.
  const activeCardId = useRef(cardId)

  useEffect(() => {
    activeCardId.current = cardId
    setMode('idle')
    setError(null)
    setComparing(null)
    setPending(false)
    void getRecording(cardId).then((b) => b && setMode('has-take'))
    return () => {
      cancelRecording()
      stopPlayback()
    }
  }, [cardId])

  async function toggle() {
    if (pending) return
    const requestedFor = cardId
    setError(null)
    setPending(true)
    if (mode === 'recording') {
      try {
        await stopRecording(cardId)
        if (activeCardId.current === requestedFor) setMode('has-take')
      } catch (e) {
        if (activeCardId.current === requestedFor) {
          setMode('idle')
          setError(errorMessageOf(e, 'A gravação falhou.'))
        }
      } finally {
        if (activeCardId.current === requestedFor) setPending(false)
      }
      return
    }
    try {
      await startRecording()
      if (activeCardId.current === requestedFor) setMode('recording')
    } catch (e) {
      if (activeCardId.current === requestedFor) {
        setError(errorMessageOf(e, 'Não foi possível gravar.'))
      }
    } finally {
      if (activeCardId.current === requestedFor) setPending(false)
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
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={mode === 'recording'}
        aria-busy={pending}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-wider transition disabled:opacity-60 ${
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
        {recordLabel(mode, pending)}
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

function recordLabel(mode: Mode, pending: boolean): string {
  if (pending) return mode === 'recording' ? 'Finalizando…' : 'Permitindo o microfone…'
  if (mode === 'recording') return 'Parar'
  if (mode === 'has-take') return 'Regravar'
  return 'Gravar minha voz'
}
