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

/** `permanent` marca "não configurado" (501) — só esse caso desliga a nuvem pro resto da sessão. */
export class TtsUnavailable extends Error {
  constructor(message: string, public readonly permanent = false) {
    super(message)
  }
}

let currentVoice = DEFAULT_VOICE
/** Trocar a voz invalida o cache: o áudio antigo continua salvo, mas não é usado. */
export function setVoice(voice: string) {
  currentVoice = voice
}
export const activeVoice = () => currentVoice

/**
 * Identifica qual chamada de speak() é a "dona" atual do <audio> compartilhado.
 * Uma chamada mais nova troca o src por baixo de uma mais antiga (auto-play do
 * cartão seguinte, "Repetir" clicado duas vezes, `stop()` no cleanup do efeito);
 * isso rejeita a promise de play() ou dispara "pause"/"error" na antiga mesmo
 * com o áudio já tendo tocado. Sem o token, esse encerramento benigno virava
 * "Não foi possível reproduzir o áudio." na tela.
 */
let playToken = 0

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
    const token = ++playToken
    const a = audioEl()
    if (a.src.startsWith('blob:')) URL.revokeObjectURL(a.src)
    a.src = URL.createObjectURL(blob)
    // Mantém o timbre ao reduzir a velocidade, em vez de gerar um segundo áudio.
    ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    a.playbackRate = rate

    try {
      await a.play()
    } catch (e) {
      if (token !== playToken) return
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }

    // Sem isso a promise resolvia assim que o play começava, não quando o
    // áudio terminava — a onda parava de animar bem antes do fim da frase.
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        a.removeEventListener('ended', onEnded)
        a.removeEventListener('pause', onPause)
        a.removeEventListener('error', onError)
      }
      const onEnded = () => {
        cleanup()
        resolve()
      }
      const onPause = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        if (token !== playToken) resolve()
        else reject(new Error('Não foi possível reproduzir o áudio.'))
      }
      a.addEventListener('ended', onEnded)
      a.addEventListener('pause', onPause)
      a.addEventListener('error', onError)
    })
  },
}

/**
 * Uma frase só é buscada uma vez, mesmo que o pré-carregamento do cartão
 * seguinte e o play do cartão atual peçam o mesmo áudio ao mesmo tempo.
 */
const inflight = new Map<string, Promise<Blob>>()

/** Depois disso a espera já atrapalha mais do que a voz neural ajuda. */
const FETCH_TIMEOUT_MS = 8_000

function getOrFetch(cardId: string, text: string): Promise<Blob> {
  const key = `${cardId}|${currentVoice}`
  const pending = inflight.get(key)
  if (pending) return pending

  const job = fetchAudio(cardId, text).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

async function fetchAudio(cardId: string, text: string): Promise<Blob> {
  const cached = await db.audioBlobs
    .where({ cardId, kind: 'tts' })
    .filter((b) => (b.voice ?? DEFAULT_VOICE) === currentVoice)
    .first()
  if (cached) return cached.blob

  let res: Response
  try {
    res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: currentVoice }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new TtsUnavailable('O serviço de áudio não respondeu.')
  }

  if (res.status === 501) throw new TtsUnavailable('Voz neural não configurada.', true)
  if (!res.ok) throw new TtsUnavailable('O serviço de áudio não respondeu.')

  const blob = await res.blob()
  // Sem `/api` no ar (dev sem `vercel dev`) a rota devolve o index.html com 200:
  // sem esta checagem viraria um erro de decodificação no elemento <audio>.
  if (!blob.type.startsWith('audio/')) {
    throw new TtsUnavailable('Voz neural não configurada.', true)
  }

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
/**
 * Falha passageira não pode custar um round-trip perdido em cada cartão: depois
 * de duas seguidas a nuvem sai do caminho por um minuto e a voz do navegador
 * responde na hora. Um sucesso zera a contagem.
 */
let consecutiveFailures = 0
let cloudPausedUntil = 0
const FAILURES_BEFORE_PAUSE = 2
const PAUSE_MS = 60_000

const cloudUsable = () => !cloudDisabledForSession && Date.now() >= cloudPausedUntil

function noteFailure(e: unknown) {
  if (!(e instanceof TtsUnavailable)) return false
  if (e.permanent) cloudDisabledForSession = true
  else if (++consecutiveFailures >= FAILURES_BEFORE_PAUSE) {
    cloudPausedUntil = Date.now() + PAUSE_MS
    consecutiveFailures = 0
  }
  return true
}

/** Provider ativo, resolvido sozinho. A UI não precisa saber qual é. */
export const speech: SpeechProvider = {
  get id() {
    return cloudUsable() ? ('cloud' as const) : ('webspeech' as const)
  },
  stop() {
    webSpeech.stop()
    cloudTts.stop()
  },
  async warm(cardId, text) {
    if (!cloudUsable()) return
    // Pré-carregamento é oportunista: falhar aqui nunca vira erro na tela.
    try {
      await cloudTts.warm(cardId, text)
      consecutiveFailures = 0
    } catch (e) {
      noteFailure(e)
    }
  },
  async speak(cardId, text, rate) {
    if (cloudUsable()) {
      try {
        await cloudTts.speak(cardId, text, rate)
        consecutiveFailures = 0
        return
      } catch (e) {
        if (!noteFailure(e)) throw e
      }
    }
    await webSpeech.speak(cardId, text, rate)
  },
}

export const usingNeuralVoice = () => cloudUsable()

let currentRate = DEFAULT_RATE

/** Velocidade padrão da narração, configurável nos ajustes. */
export function setSpeechRate(rate: number) {
  currentRate = rate
}

export const normalRate = () => currentRate
/** "Devagar" é sempre relativo à sua velocidade padrão, não a um valor fixo. */
export const slowRate = () => Math.max(0.5, currentRate * 0.7)
