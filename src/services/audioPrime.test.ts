import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubObjectUrl } from '../test/dbHelpers'

async function loadAudioPrime() {
  vi.resetModules()
  return import('./audioPrime')
}

class FakeAudioElement {
  static instances: FakeAudioElement[] = []
  muted = false
  src = ''

  constructor() {
    FakeAudioElement.instances.push(this)
  }

  play() {
    return Promise.resolve()
  }
}

class FakeUtterance {
  static count = 0
  constructor(public text: string) {
    FakeUtterance.count++
  }
}

const speechSynthesisMock = { speak: vi.fn() }
let restoreObjectUrl = () => {}

beforeEach(() => {
  FakeAudioElement.instances = []
  FakeUtterance.count = 0
  speechSynthesisMock.speak.mockClear()
  vi.stubGlobal('Audio', FakeAudioElement)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', speechSynthesisMock)
  restoreObjectUrl = stubObjectUrl('blob:prime').restore
})

afterEach(() => {
  restoreObjectUrl()
  vi.unstubAllGlobals()
})

describe('primeAudio', () => {
  it('toca um áudio mudo e fala uma utterance vazia para aquecer o pipeline', async () => {
    const { primeAudio } = await loadAudioPrime()

    primeAudio()
    await Promise.resolve()

    expect(FakeAudioElement.instances).toHaveLength(1)
    expect(FakeAudioElement.instances[0].muted).toBe(true)
    expect(FakeAudioElement.instances[0].src).toBe('blob:prime')
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1)
    expect(FakeUtterance.count).toBe(1)
  })

  it('só aquece uma vez por sessão', async () => {
    const { primeAudio } = await loadAudioPrime()

    primeAudio()
    primeAudio()
    await Promise.resolve()

    expect(FakeAudioElement.instances).toHaveLength(1)
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1)
  })

  it('não quebra quando o navegador não tem SpeechSynthesis', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { primeAudio } = await loadAudioPrime()

    expect(() => primeAudio()).not.toThrow()
  })
})
