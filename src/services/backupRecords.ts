import { selectAudio } from './backupAudio'
import type { AudioEntry } from './backupFormat'
import { db, type Card, type Deck, type ReviewLog } from './db'

export interface BackupRecords {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
}

export interface BackupSizeEstimate {
  data: number
  recordings: number
  narrations: number
}

/** O arquivo não carrega estado de sincronização: quem decide o que está
 *  pendente de envio é a restauração. */
export async function collectRecords(): Promise<BackupRecords> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ])
  return {
    decks: decks.map((d) => ({ ...d, dirty: 0 })),
    cards: cards.map((c) => ({ ...c, dirty: 0 })),
    reviewLogs: reviewLogs.map((l) => ({ ...l, dirty: 0 })),
  }
}

/** Fora de `backupExport` de propósito: a tela de Ajustes mostra a estimativa
 *  sem baixar o JSZip, que só entra quando o usuário gera o arquivo. */
export async function estimateBackupSize(): Promise<BackupSizeEstimate> {
  const records = await collectRecords()
  const audio = await selectAudio(records.cards, true)
  const bytesOf = (kind: AudioEntry['kind']) =>
    audio.filter((a) => a.entry.kind === kind).reduce((total, a) => total + a.entry.bytes, 0)
  return {
    data: new Blob([JSON.stringify(records)]).size,
    recordings: bytesOf('user_recording'),
    narrations: bytesOf('tts'),
  }
}
