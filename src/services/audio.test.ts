import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { resetDb, stubObjectUrl } from '../test/dbHelpers'

/**
 * O módulo guarda estado de sessão (voz atual, nuvem desligada, pausa após
 * falhas). Cada teste recarrega o módulo para partir sempre do mesmo ponto.
 */
async function loadAudio() {
  vi.resetModules()
  const audio = await import('./audio')
  const { db } = await import('./db')
  return { ...audio, db }
}

function sentBody(fetchMock: Mock, call: number): string {
  const body = (fetchMock.mock.calls[call] as [string, RequestInit])[1].body
  return typeof body === 'string' ? body : ''
}

function mp3(content = 'mp3') {
  return new Blob([content], { type: 'audio/mpeg' })
}

function audioResponse(blob = mp3()) {
  return new Response(blob, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
}

class FakeUtterance {
  static last: FakeUtterance | null = null
  voice: { name: string; lang: string } | null = null
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public text: string) {
    FakeUtterance.last = this
  }
}

class FakeAudioElement {
  static plays = 0
  static lastSrc = ''
  static playbackRates: number[] = []
  static pauses = 0
  static failNextPlayWith: Error | null = null
  static endWith: 'ended' | 'pause' | 'error' = 'ended'

  src = ''
  playbackRate = 1
  preservesPitch = false
  private listeners = new Map<string, (() => void)[]>()

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== listener))
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener()
  }

  play() {
    FakeAudioElement.plays++
    FakeAudioElement.lastSrc = this.src
    FakeAudioElement.playbackRates.push(this.playbackRate)
    const failure = FakeAudioElement.failNextPlayWith
    if (failure) {
      FakeAudioElement.failNextPlayWith = null
      return Promise.reject(failure)
    }
    setTimeout(() => this.emit(FakeAudioElement.endWith), 0)
    return Promise.resolve()
  }

  pause() {
    FakeAudioElement.pauses++
  }
}

let restoreObjectUrl = () => {}

const speechSynthesisMock = {
  cancel: vi.fn(),
  getVoices: vi.fn(() => [] as { name: string; lang: string }[]),
  speak: vi.fn((u: FakeUtterance) => setTimeout(() => u.onend?.(), 0)),
}

beforeEach(() => {
  FakeAudioElement.plays = 0
  FakeAudioElement.pauses = 0
  FakeAudioElement.lastSrc = ''
  FakeAudioElement.playbackRates = []
  FakeAudioElement.failNextPlayWith = null
  FakeAudioElement.endWith = 'ended'
  FakeUtterance.last = null
  speechSynthesisMock.cancel.mockClear()
  speechSynthesisMock.speak.mockClear()
  speechSynthesisMock.getVoices.mockReturnValue([])
  vi.stubGlobal('Audio', FakeAudioElement)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', speechSynthesisMock)
  restoreObjectUrl = stubObjectUrl('blob:tts').restore
})

afterEach(async () => {
  restoreObjectUrl()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
  await resetDb()
})

describe('webSpeech', () => {
  it('fala em en-US na velocidade pedida e resolve no fim da fala', async () => {
    const { webSpeech } = await loadAudio()

    await webSpeech.speak('c1', 'I gave up', 0.8)

    expect(FakeUtterance.last?.text).toBe('I gave up')
    expect(FakeUtterance.last?.lang).toBe('en-US')
    expect(FakeUtterance.last?.rate).toBe(0.8)
    expect(speechSynthesisMock.cancel).toHaveBeenCalled()
  })

  it('prefere a voz americana neural quando existe', async () => {
    speechSynthesisMock.getVoices.mockReturnValue([
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Ava (Premium)', lang: 'en-US' },
    ])
    const { webSpeech } = await loadAudio()

    await webSpeech.speak('c1', 'hi', 1)

    expect(FakeUtterance.last?.voice?.name).toBe('Ava (Premium)')
  })

  it('cai para qualquer voz en-US e, na falta dela, para qualquer inglês', async () => {
    speechSynthesisMock.getVoices.mockReturnValue([
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Samantha', lang: 'en-US' },
    ])
    const comAmericana = await loadAudio()
    await comAmericana.webSpeech.speak('c1', 'hi', 1)
    expect(FakeUtterance.last?.voice?.name).toBe('Samantha')

    speechSynthesisMock.getVoices.mockReturnValue([{ name: 'Daniel', lang: 'en-GB' }])
    const semAmericana = await loadAudio()
    await semAmericana.webSpeech.speak('c1', 'hi', 1)
    expect(FakeUtterance.last?.voice?.name).toBe('Daniel')
  })

  it('rejeita quando a síntese falha', async () => {
    speechSynthesisMock.speak.mockImplementationOnce((u: FakeUtterance) =>
      setTimeout(() => u.onerror?.(), 0),
    )
    const { webSpeech } = await loadAudio()

    await expect(webSpeech.speak('c1', 'hi', 1)).rejects.toThrow('Não foi possível reproduzir o áudio.')
  })

  it('cancela a fala em andamento no stop', async () => {
    const { webSpeech } = await loadAudio()

    webSpeech.stop()

    expect(speechSynthesisMock.cancel).toHaveBeenCalled()
  })
})

describe('cloudTts', () => {
  it('busca o áudio, guarda no cache local e toca na velocidade pedida', async () => {
    const fetchMock = vi.fn().mockImplementation(() => audioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { cloudTts, db } = await loadAudio()

    await cloudTts.speak('c1', 'I gave up', 0.7)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sentBody(fetchMock, 0))).toEqual({ text: 'I gave up', voice: 'nova' })
    expect(FakeAudioElement.lastSrc).toBe('blob:tts')
    expect(FakeAudioElement.playbackRates).toEqual([0.7])
    const cached = await db.audioBlobs.where({ cardId: 'c1', kind: 'tts' }).toArray()
    expect(cached).toHaveLength(1)
    expect(cached[0].voice).toBe('nova')
  })

  it('não busca de novo o que já está no cache', async () => {
    const fetchMock = vi.fn().mockImplementation(() => audioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { cloudTts } = await loadAudio()

    await cloudTts.warm('c1', 'I gave up')
    await cloudTts.speak('c1', 'I gave up', 1)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('busca de novo quando a voz muda', async () => {
    const fetchMock = vi.fn().mockImplementation(() => audioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { cloudTts, setVoice, activeVoice } = await loadAudio()

    await cloudTts.warm('c1', 'I gave up')
    setVoice('onyx')
    await cloudTts.warm('c1', 'I gave up')

    expect(activeVoice()).toBe('onyx')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((JSON.parse(sentBody(fetchMock, 1)) as { voice: string }).voice).toBe('onyx')
  })

  it('atende uma só requisição quando duas chamadas pedem o mesmo áudio', async () => {
    const fetchMock = vi.fn().mockImplementation(() => audioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { cloudTts } = await loadAudio()

    await Promise.all([cloudTts.warm('c1', 'I gave up'), cloudTts.warm('c1', 'I gave up')])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('não guarda o áudio da pré-escuta do cadastro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    const { cloudTts, db } = await loadAudio()

    await cloudTts.warm('preview', 'I gave up')

    expect(await db.audioBlobs.count()).toBe(0)
  })

  it('trata 501 como falta de configuração permanente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response('', { status: 501 })))
    const { cloudTts, TtsUnavailable } = await loadAudio()

    const error = await cloudTts.warm('c1', 'x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TtsUnavailable)
    expect((error as InstanceType<typeof TtsUnavailable>).permanent).toBe(true)
  })

  it('trata resposta que não é áudio como falta de configuração', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })),
    )
    const { cloudTts, TtsUnavailable } = await loadAudio()

    const error = await cloudTts.warm('c1', 'x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TtsUnavailable)
    expect((error as InstanceType<typeof TtsUnavailable>).permanent).toBe(true)
  })

  it('trata erro de rede e HTTP como falha passageira', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const rede = await loadAudio()
    const erroDeRede = await rede.cloudTts.warm('c1', 'x').catch((e: unknown) => e)
    expect(erroDeRede).toBeInstanceOf(rede.TtsUnavailable)
    expect((erroDeRede as InstanceType<typeof rede.TtsUnavailable>).permanent).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response('', { status: 500 })))
    const http = await loadAudio()
    const erroHttp = await http.cloudTts.warm('c1', 'x').catch((e: unknown) => e)
    expect((erroHttp as InstanceType<typeof http.TtsUnavailable>).permanent).toBe(false)
  })

  it('resolve quando o áudio é interrompido por uma reprodução mais nova', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    FakeAudioElement.endWith = 'pause'
    const { cloudTts } = await loadAudio()

    await expect(cloudTts.speak('c1', 'x', 1)).resolves.toBeUndefined()
  })

  it('reporta erro real de reprodução', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    FakeAudioElement.endWith = 'error'
    const { cloudTts } = await loadAudio()

    await expect(cloudTts.speak('c1', 'x', 1)).rejects.toThrow('Não foi possível reproduzir o áudio.')
  })

  it('ignora o AbortError de um play cancelado pelo próximo cartão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    FakeAudioElement.failNextPlayWith = new DOMException('interrompido', 'AbortError')
    const { cloudTts } = await loadAudio()

    await expect(cloudTts.speak('c1', 'x', 1)).resolves.toBeUndefined()
  })

  it('propaga falha de play que não é cancelamento', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    FakeAudioElement.failNextPlayWith = new Error('sem permissão de autoplay')
    const { cloudTts } = await loadAudio()

    await expect(cloudTts.speak('c1', 'x', 1)).rejects.toThrow('sem permissão de autoplay')
  })

  it('pausa o áudio no stop', async () => {
    const { cloudTts } = await loadAudio()

    cloudTts.stop()

    expect(FakeAudioElement.pauses).toBe(1)
  })
})

describe('speech', () => {
  it('usa a nuvem enquanto ela responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    const { speech, usingNeuralVoice } = await loadAudio()

    await speech.speak('c1', 'I gave up', 1)

    expect(speech.id).toBe('cloud')
    expect(usingNeuralVoice()).toBe(true)
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled()
  })

  it('cai para a voz do navegador e desliga a nuvem quando ela não está configurada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response('', { status: 501 })))
    const { speech, usingNeuralVoice } = await loadAudio()

    await speech.speak('c1', 'I gave up', 1)

    expect(speechSynthesisMock.speak).toHaveBeenCalled()
    expect(speech.id).toBe('webspeech')
    expect(usingNeuralVoice()).toBe(false)
  })

  it('pausa a nuvem por um minuto depois de duas falhas seguidas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { speech } = await loadAudio()

    await speech.speak('c1', 'x', 1)
    expect(speech.id).toBe('cloud')

    await speech.speak('c2', 'x', 1)
    expect(speech.id).toBe('webspeech')

    vi.setSystemTime(new Date('2026-03-09T12:01:01Z'))
    expect(speech.id).toBe('cloud')
  })

  it('zera a contagem de falhas quando a nuvem volta a responder', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(audioResponse())
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const { speech } = await loadAudio()

    await speech.speak('c1', 'x', 1)
    await speech.speak('c2', 'x', 1)
    await speech.speak('c3', 'x', 1)

    expect(speech.id).toBe('cloud')
  })

  it('não deixa o pré-carregamento virar erro na tela', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { speech } = await loadAudio()

    await expect(speech.warm('c1', 'x')).resolves.toBeUndefined()
  })

  it('não pré-carrega enquanto a nuvem está desligada', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response('', { status: 501 }))
    vi.stubGlobal('fetch', fetchMock)
    const { speech } = await loadAudio()

    await speech.warm('c1', 'x')
    await speech.warm('c2', 'x')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('propaga erro de reprodução em vez de mascarar com a voz do navegador', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => audioResponse()))
    FakeAudioElement.endWith = 'error'
    const { speech } = await loadAudio()

    await expect(speech.speak('c1', 'x', 1)).rejects.toThrow('Não foi possível reproduzir o áudio.')
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled()
  })

  it('para as duas fontes de voz de uma vez', async () => {
    const { speech } = await loadAudio()

    speech.stop()

    expect(speechSynthesisMock.cancel).toHaveBeenCalled()
    expect(FakeAudioElement.pauses).toBe(1)
  })
})

describe('velocidade da narração', () => {
  it('usa a velocidade padrão até ser configurada', async () => {
    const { normalRate, slowRate } = await loadAudio()

    expect(normalRate()).toBe(1)
    expect(slowRate()).toBeCloseTo(0.7)
  })

  it('deriva a velocidade lenta da velocidade configurada', async () => {
    const { setSpeechRate, normalRate, slowRate } = await loadAudio()

    setSpeechRate(1.2)

    expect(normalRate()).toBe(1.2)
    expect(slowRate()).toBeCloseTo(0.84)
  })

  it('nunca desce abaixo de 0,5 na velocidade lenta', async () => {
    const { setSpeechRate, slowRate } = await loadAudio()

    setSpeechRate(0.6)

    expect(slowRate()).toBe(0.5)
  })
})
