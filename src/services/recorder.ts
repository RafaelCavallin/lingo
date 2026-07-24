import { db, uid } from './db'

/**
 * Gravação da própria leitura da frase. Guardamos apenas a última gravação de
 * cada cartão: a comparação é feita na hora, e histórico de áudio só ocuparia
 * espaço sem servir ao estudo.
 */
export class RecordingUnsupported extends Error {}
export class MicrophoneDenied extends Error {}

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let playback: HTMLAudioElement | null = null

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

function mimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export async function startRecording(): Promise<void> {
  if (!canRecord()) throw new RecordingUnsupported('Este navegador não grava áudio.')
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new MicrophoneDenied('Sem acesso ao microfone. Libere a permissão para gravar.')
  }
  const type = mimeType()
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  recorder.start()
}

export async function stopRecording(cardId: string): Promise<Blob> {
  const r = recorder
  if (!r) throw new Error('Nenhuma gravação em andamento.')

  const chunks: Blob[] = []
  const blob = await new Promise<Blob>((resolve) => {
    r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    r.onstop = () => resolve(new Blob(chunks, { type: r.mimeType || 'audio/webm' }))
    r.stop()
  })

  stream?.getTracks().forEach((t) => t.stop())
  recorder = null
  stream = null

  await db.transaction('rw', db.audioBlobs, async () => {
    const previous = await db.audioBlobs.where({ cardId, kind: 'user_recording' }).toArray()
    if (previous.length) await db.audioBlobs.bulkDelete(previous.map((p) => p.id))
    await db.audioBlobs.add({ id: uid(), cardId, kind: 'user_recording', blob, createdAt: Date.now() })
  })

  return blob
}

export function cancelRecording(): void {
  try {
    recorder?.stop()
  } catch {
    /* já parado */
  }
  stream?.getTracks().forEach((t) => t.stop())
  recorder = null
  stream = null
}

export async function getRecording(cardId: string): Promise<Blob | null> {
  const found = await db.audioBlobs.where({ cardId, kind: 'user_recording' }).first()
  return found?.blob ?? null
}

export async function playRecording(cardId: string): Promise<void> {
  const blob = await getRecording(cardId)
  if (!blob) return
  playback ??= new Audio()
  playback.src = URL.createObjectURL(blob)
  await playback.play()
  await new Promise<void>((resolve) => {
    playback!.onended = () => resolve()
  })
}

export function stopPlayback(): void {
  playback?.pause()
}
