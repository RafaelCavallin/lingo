import { audioFileName, type AudioEntry } from './backupFormat'
import { db, type AudioBlob, type Card } from './db'

export interface SelectedAudio {
  entry: AudioEntry
  blob: Blob
}

/** `tts_slow` nunca é gravado por ponto de escrita nenhum (o "devagar" é
 *  `playbackRate`): exportá-lo seria formalizar código morto. */
function isExportable(blob: AudioBlob, includeNarrations: boolean): boolean {
  if (blob.kind === 'tts_slow') return false
  return blob.kind === 'user_recording' || includeNarrations
}

function toEntry(blob: AudioBlob, sentence: string): AudioEntry {
  return {
    id: blob.id,
    cardId: blob.cardId,
    kind: blob.kind === 'tts' ? 'tts' : 'user_recording',
    voice: blob.voice ?? null,
    createdAt: blob.createdAt,
    mimeType: blob.blob.type,
    bytes: blob.blob.size,
    sentence,
    path: audioFileName(blob.id, blob.blob.type),
  }
}

/** Áudio órfão fica de fora: sem o cartão não há frase para conferir na volta,
 *  e a restauração o descartaria de qualquer jeito. */
export async function selectAudio(cards: Card[], includeNarrations: boolean): Promise<SelectedAudio[]> {
  const sentences = new Map(cards.map((c) => [c.id, c.sentence]))
  const blobs = await db.audioBlobs.toArray()
  const selected: SelectedAudio[] = []
  for (const blob of blobs) {
    const sentence = sentences.get(blob.cardId)
    if (sentence === undefined) continue
    if (!isExportable(blob, includeNarrations)) continue
    selected.push({ entry: toEntry(blob, sentence), blob: blob.blob })
  }
  return selected
}
