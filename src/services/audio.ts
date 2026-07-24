import { db, uid, DEFAULT_VOICE, DEFAULT_RATE } from './db'

/**
 * Duas fontes de voz atrás da mesma interface:
 *  - cloud: TTS neural via /api/tts, com o MP3 guardado em IndexedDB (revisão offline).
 *  - webspeech: voz en-US do navegador, sem configuração nenhuma.
 *
 * O app tenta a nuvem e, se ela não estiver configurada ou falhar, passa a usar a
 * voz do navegador pelo resto da sessão — o estudo nunca para por causa do áudio.
 */
export interface SpeechProvider {
  readonly id: 'webspeech' | 'cloud'
  speak(cardId: string, text: string, rate: number): Promise<void>
  stop(): void
  warm(cardId: string, text: string): Promise<void>
}

const AMERICAN = /^en[-_]US$/i

function pickAmericanVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  return (
    voices.find((v) => AMERICAN.test(v.lang) && /natural|neural|premium|enhanced/i.test(v.name)) ??
    voices.find((v) => AMERICAN.test(v.lang)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en'))
  )
}

export const webSpeech: SpeechProvider = {
  id: 'webspeech',
  async warm() {},
  stop() {
    speechSynthesis.cancel()
  },
  speak(_cardId, text, rate) {
    return new Promise((resolve, reject) => {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const voice = pickAmericanVoice()
      if (voice) u.voice = voice
      u.lang = 'en-US'
      u.rate = rate
      u.onend = () => resolve()
      u.onerror = () => reject(new Error('Não foi possível reproduzir o áudio.'))
      speechSynthesis.speak(u)
    })
  },
}

let el: HTMLAudioElement | null = null
const audioEl = () => (el ??= new Audio())

export class TtsUnavailable extends Error {}

let currentVoice = DEFAULT_VOICE
/** Trocar a voz invalida o cache: o áudio antigo continua salvo, mas não é usado. */
export function setVoice(voice: string) {
  currentVoice = voice
}
export const activeVoice = () => currentVoice

export const cloudTts: SpeechProvider = {
  id: 'cloud',
  async warm(cardId, text) {
    await getOrFetch(cardId, text)
  },
  stop() {
    audioEl().pause()
  },
  async speak(cardId, text, rate) {
    const blob = await getOrFetch(cardId, text)
    const a = audioEl()
    a.src = URL.createObjectURL(blob)
    // Mantém o timbre ao reduzir a velocidade, em vez de gerar um segundo áudio.
    ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    a.playbackRate = rate
    await a.play()
  },
}

async function getOrFetch(cardId: string, text: string): Promise<Blob> {
  const cached = await db.audioBlobs
    .where({ cardId, kind: 'tts' })
    .filter((b) => (b.voice ?? DEFAULT_VOICE) === currentVoice)
    .first()
  if (cached) return cached.blob

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: currentVoice }),
  })

  if (res.status === 501) throw new TtsUnavailable('Voz neural não configurada.')
  if (!res.ok) throw new TtsUnavailable('O serviço de áudio não respondeu.')

  const blob = await res.blob()
  // Pré-escuta no cadastro não gera lixo permanente.
  if (cardId !== 'preview') {
    await db.audioBlobs.add({
      id: uid(),
      cardId,
      kind: 'tts',
      blob,
      createdAt: Date.now(),
      voice: currentVoice,
    })
  }
  return blob
}

let cloudDisabledForSession = false

/** Provider ativo, resolvido sozinho. A UI não precisa saber qual é. */
export const speech: SpeechProvider = {
  get id() {
    return cloudDisabledForSession ? ('webspeech' as const) : ('cloud' as const)
  },
  stop() {
    webSpeech.stop()
    cloudTts.stop()
  },
  async warm(cardId, text) {
    if (cloudDisabledForSession) return
    try {
      await cloudTts.warm(cardId, text)
    } catch (e) {
      if (e instanceof TtsUnavailable) cloudDisabledForSession = true
    }
  },
  async speak(cardId, text, rate) {
    if (!cloudDisabledForSession) {
      try {
        await cloudTts.speak(cardId, text, rate)
        return
      } catch (e) {
        if (e instanceof TtsUnavailable) cloudDisabledForSession = true
        else throw e
      }
    }
    await webSpeech.speak(cardId, text, rate)
  },
}

export const usingNeuralVoice = () => !cloudDisabledForSession

let currentRate = DEFAULT_RATE

/** Velocidade padrão da narração, configurável nos ajustes. */
export function setSpeechRate(rate: number) {
  currentRate = rate
}

export const normalRate = () => currentRate
/** "Devagar" é sempre relativo à sua velocidade padrão, não a um valor fixo. */
export const slowRate = () => Math.max(0.5, currentRate * 0.7)
