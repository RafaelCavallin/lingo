import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  MicrophoneDenied,
  RecordingUnsupported,
  cancelRecording,
  canRecord,
  getRecording,
  playRecording,
  startRecording,
  stopPlayback,
  stopRecording,
} from './recorder'
import { resetDb, stubObjectUrl } from '../test/dbHelpers'

let restoreObjectUrl = () => {}

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] }

class FakeMediaRecorder {
  static supportedTypes = ['audio/webm;codecs=opus']
  static isTypeSupported = (type: string) => FakeMediaRecorder.supportedTypes.includes(type)
  static last: FakeMediaRecorder | null = null

  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  started = false
  readonly mimeType: string

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.last = this
  }

  start() {
    this.started = true
  }

  stop() {
    this.ondataavailable?.({ data: new Blob(['audio']) })
    this.ondataavailable?.({ data: new Blob([]) })
    this.onstop?.()
  }
}

/**
 * O módulo guarda um <audio> único entre chamadas, então a instância sobrevive
 * de um teste para o outro: o que cada teste observa são os contadores, zerados
 * no beforeEach, e não a identidade do objeto.
 */
class FakeAudio {
  static plays = 0
  static pauses = 0
  static lastSrc = ''
  src = ''
  onended: (() => void) | null = null

  play() {
    FakeAudio.plays++
    FakeAudio.lastSrc = this.src
    setTimeout(() => this.onended?.(), 0)
    return Promise.resolve()
  }

  pause() {
    FakeAudio.pauses++
  }
}

function useMicrophone(getUserMedia = vi.fn().mockResolvedValue(stream)) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  return getUserMedia
}

beforeEach(() => {
  FakeMediaRecorder.supportedTypes = ['audio/webm;codecs=opus']
  FakeMediaRecorder.last = null
  FakeAudio.plays = 0
  FakeAudio.pauses = 0
  FakeAudio.lastSrc = ''
  track.stop.mockClear()
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('Audio', FakeAudio)
  restoreObjectUrl = stubObjectUrl('blob:gravacao').restore
  useMicrophone()
})

afterEach(async () => {
  restoreObjectUrl()
  cancelRecording()
  vi.unstubAllGlobals()
  await resetDb()
})

describe('canRecord', () => {
  it('é verdadeiro com MediaRecorder e microfone disponíveis', () => {
    expect(canRecord()).toBe(true)
  })

  it('é falso quando o navegador não expõe MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined)

    expect(canRecord()).toBe(false)
  })

  it('é falso quando não há getUserMedia', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })

    expect(canRecord()).toBe(false)
  })
})

describe('startRecording', () => {
  it('inicia a gravação com o primeiro mime suportado', async () => {
    await startRecording()

    expect(FakeMediaRecorder.last?.started).toBe(true)
    expect(FakeMediaRecorder.last?.mimeType).toBe('audio/webm;codecs=opus')
  })

  it('grava sem mime explícito quando nenhum candidato é suportado', async () => {
    FakeMediaRecorder.supportedTypes = []

    await startRecording()

    expect(FakeMediaRecorder.last?.mimeType).toBe('')
  })

  it('recusa quando o navegador não sabe gravar', async () => {
    vi.stubGlobal('MediaRecorder', undefined)

    await expect(startRecording()).rejects.toBeInstanceOf(RecordingUnsupported)
  })

  it('traduz a recusa do microfone em erro de permissão', async () => {
    useMicrophone(vi.fn().mockRejectedValue(new Error('NotAllowedError')))

    await expect(startRecording()).rejects.toBeInstanceOf(MicrophoneDenied)
  })
})

describe('stopRecording', () => {
  it('salva a gravação do cartão e libera o microfone', async () => {
    await startRecording()

    const blob = await stopRecording('c1')

    expect(blob.size).toBeGreaterThan(0)
    expect(track.stop).toHaveBeenCalled()
    const saved = await db.audioBlobs.where({ cardId: 'c1', kind: 'user_recording' }).toArray()
    expect(saved).toHaveLength(1)
  })

  it('mantém apenas a última gravação de cada cartão', async () => {
    await startRecording()
    await stopRecording('c1')
    await startRecording()
    await stopRecording('c1')

    expect(await db.audioBlobs.where({ cardId: 'c1', kind: 'user_recording' }).count()).toBe(1)
  })

  it('não apaga a gravação de outro cartão', async () => {
    await startRecording()
    await stopRecording('c1')
    await startRecording()
    await stopRecording('c2')

    expect(await db.audioBlobs.where({ kind: 'user_recording' }).count()).toBe(2)
  })

  it('falha quando não há gravação em andamento', async () => {
    await expect(stopRecording('c1')).rejects.toThrow('Nenhuma gravação em andamento.')
  })
})

describe('cancelRecording', () => {
  it('descarta a gravação sem salvar nada', async () => {
    await startRecording()

    cancelRecording()

    expect(track.stop).toHaveBeenCalled()
    expect(await db.audioBlobs.count()).toBe(0)
    await expect(stopRecording('c1')).rejects.toThrow('Nenhuma gravação em andamento.')
  })

  it('é inofensivo quando não há nada gravando', () => {
    expect(() => cancelRecording()).not.toThrow()
  })
})

describe('getRecording', () => {
  it('devolve null quando o cartão nunca foi gravado', async () => {
    expect(await getRecording('c1')).toBeNull()
  })

  it('devolve null quando o cartão só tem áudio de TTS', async () => {
    await db.audioBlobs.add({
      id: 'tts1',
      cardId: 'c1',
      kind: 'tts',
      blob: new Blob(['tts']),
      createdAt: 1,
    })

    expect(await getRecording('c1')).toBeNull()
  })

  // O fake-indexeddb devolve Blob como objeto simples: dá para afirmar que a
  // gravação certa foi encontrada, não inspecionar o conteúdo dela.
  it('devolve a gravação do cartão mesmo com áudio de TTS salvo junto', async () => {
    await db.audioBlobs.add({
      id: 'tts1',
      cardId: 'c1',
      kind: 'tts',
      blob: new Blob(['tts']),
      createdAt: 1,
    })
    await startRecording()
    await stopRecording('c1')

    expect(await getRecording('c1')).not.toBeNull()
    expect(await getRecording('c2')).toBeNull()
  })
})

describe('playRecording', () => {
  it('toca a gravação até o fim', async () => {
    await startRecording()
    await stopRecording('c1')

    await playRecording('c1')

    expect(FakeAudio.plays).toBe(1)
    expect(FakeAudio.lastSrc).toBe('blob:gravacao')
  })

  it('não faz nada quando o cartão não tem gravação', async () => {
    await playRecording('sem-gravacao')

    expect(FakeAudio.plays).toBe(0)
  })

  it('pausa a reprodução em andamento', async () => {
    await startRecording()
    await stopRecording('c1')
    await playRecording('c1')

    stopPlayback()

    expect(FakeAudio.pauses).toBe(1)
  })
})
