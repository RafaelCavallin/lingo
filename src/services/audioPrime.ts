const SILENT_WAV_SAMPLE_RATE = 8000
const SILENT_WAV_DURATION_MS = 150

/**
 * A primeira reprodução de áudio de uma aba tem "cold start" no Chrome/Firefox:
 * o pipeline de som do SO ainda não abriu, e a fala real começa atrasada e com
 * o início cortado. Aquece o <audio> e o SpeechSynthesis com algo inaudível
 * assim que o app carrega, bem antes do primeiro cartão de verdade tocar.
 */
let primed = false
export function primeAudio() {
  if (primed) return
  primed = true
  primeMediaElement()
  primeSpeechSynthesis()
}

function primeMediaElement() {
  const a = new Audio()
  a.muted = true
  const url = URL.createObjectURL(silentWav())
  a.src = url
  a.play()
    .catch(() => {})
    .finally(() => URL.revokeObjectURL(url))
}

function primeSpeechSynthesis() {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

function silentWav(): Blob {
  const samples = Math.round((SILENT_WAV_SAMPLE_RATE * SILENT_WAV_DURATION_MS) / 1000)
  const dataSize = samples * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  writeWavHeader(view, dataSize)
  return new Blob([buf], { type: 'audio/wav' })
}

function writeWavHeader(view: DataView, dataSize: number) {
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SILENT_WAV_SAMPLE_RATE, true)
  view.setUint32(28, SILENT_WAV_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
}
