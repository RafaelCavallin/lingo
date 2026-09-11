import type { AudioEntry } from './backupFormat'
import { wins, type Versioned } from './lww'

/**
 * Decisões da restauração, sem tocar no banco. `local` vem alinhado com
 * `incoming` — é o formato que o `bulkGet` do Dexie devolve.
 */
export function selectWinners<T extends Versioned>(input: {
  incoming: T[]
  local: (T | undefined)[]
}): T[] {
  return input.incoming.filter((row, index) => wins(row, input.local[index]))
}

/** Locais que o arquivo não conhece — no modo substituir, é o que será tombstonado. */
export function selectOrphans(input: { localIds: string[]; incomingIds: string[] }): string[] {
  const incoming = new Set(input.incomingIds)
  return input.localIds.filter((id) => !incoming.has(id))
}

export interface CardAudioState {
  sentence: string
  deletedAt: number
}

export interface AudioDecision {
  applicable: AudioEntry[]
  stale: number
}

/**
 * A gravação do usuário volta mesmo com a frase alterada — é a voz dele, não a
 * leitura da frase. Já a narração é do texto: se a frase mudou depois do
 * backup, o áudio do arquivo narra o texto antigo e reaplicá-lo desfaria a
 * invalidação que `updateCard` faz.
 */
export function selectApplicableAudio(input: {
  entries: AudioEntry[]
  cards: Map<string, CardAudioState>
  includeNarrations: boolean
}): AudioDecision {
  const applicable: AudioEntry[] = []
  let stale = 0
  for (const entry of input.entries) {
    if (entry.kind === 'tts' && !input.includeNarrations) continue
    const card = input.cards.get(entry.cardId)
    if (!card || card.deletedAt !== 0) {
      stale += 1
      continue
    }
    if (entry.kind === 'tts' && card.sentence !== entry.sentence) {
      stale += 1
      continue
    }
    applicable.push(entry)
  }
  return { applicable, stale }
}
