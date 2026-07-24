import { db, type Card, type Deck, type ReviewLog } from './db'

/**
 * Sincronização entre dispositivos por snapshot.
 *
 * O volume aqui é pequeno (frases e logs de revisão, sem áudio), então trocar o
 * estado inteiro é mais simples e mais robusto que um protocolo incremental —
 * e não exige servidor com banco relacional, só um par chave/valor.
 *
 * O que NÃO sobe: os blobs de áudio. Narração é regenerada pelo TTS no outro
 * aparelho, e gravações de voz são locais por natureza. Isso mantém o payload
 * na casa de dezenas de KB.
 */

const KEY_STORAGE = 'cadence.syncKey'
const LAST_SYNC = 'cadence.lastSync'

export interface Snapshot {
  version: 2
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
}

export interface SyncResult {
  pulled: number
  pushed: number
  at: number
}

export class SyncNotConfigured extends Error {}

export const syncKey = () => localStorage.getItem(KEY_STORAGE) ?? ''
export const setSyncKey = (k: string) => localStorage.setItem(KEY_STORAGE, k.trim())
export const lastSyncAt = () => Number(localStorage.getItem(LAST_SYNC)) || 0

async function localSnapshot(): Promise<Snapshot> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ])
  return { version: 2, decks, cards, reviewLogs }
}

/**
 * Regras de merge:
 *  - reviewLogs são imutáveis e têm id próprio: união simples, sem conflito possível.
 *  - cards e decks: vence quem tem `updatedAt` maior (last-write-wins).
 *  - remoção é marcada com `deletedAt` em vez de sumir, senão o outro aparelho
 *    reintroduziria o cartão apagado no próximo sync.
 */
export function merge(local: Snapshot, remote: Snapshot): { merged: Snapshot; pulled: number } {
  const logs = new Map<string, ReviewLog>()
  for (const l of [...remote.reviewLogs, ...local.reviewLogs]) logs.set(l.id, l)

  const pulledIds = new Set(
    remote.reviewLogs.filter((l) => !local.reviewLogs.some((x) => x.id === l.id)).map((l) => l.id),
  )

  return {
    merged: {
      version: 2,
      decks: mergeByUpdatedAt(local.decks, remote.decks),
      cards: mergeByUpdatedAt(local.cards, remote.cards),
      reviewLogs: [...logs.values()].sort((a, b) => a.reviewedAt - b.reviewedAt),
    },
    pulled: pulledIds.size,
  }
}

function mergeByUpdatedAt<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const out = new Map<string, T>()
  for (const item of local) out.set(item.id, item)
  for (const item of remote) {
    const mine = out.get(item.id)
    if (!mine || item.updatedAt > mine.updatedAt) out.set(item.id, item)
  }
  return [...out.values()]
}

export async function sync(): Promise<SyncResult> {
  const key = syncKey()
  if (!key) throw new SyncNotConfigured('Defina uma frase-chave de sincronização nos ajustes.')

  const local = await localSnapshot()

  const pull = await fetch(`/api/sync?key=${encodeURIComponent(key)}`)
  if (pull.status === 501) throw new SyncNotConfigured('Sincronização não configurada no servidor.')
  if (!pull.ok && pull.status !== 404) throw new Error('Não foi possível baixar os dados remotos.')

  const remote: Snapshot =
    pull.status === 404 ? { version: 2, decks: [], cards: [], reviewLogs: [] } : await pull.json()

  const { merged, pulled } = merge(local, remote)

  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    await db.decks.bulkPut(merged.decks)
    await db.cards.bulkPut(merged.cards)
    await db.reviewLogs.bulkPut(merged.reviewLogs)
  })

  const push = await fetch(`/api/sync?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  })
  if (!push.ok) throw new Error('Os dados locais foram atualizados, mas o envio falhou.')

  const at = Date.now()
  localStorage.setItem(LAST_SYNC, String(at))
  return { pulled, pushed: merged.cards.length + merged.reviewLogs.length, at }
}
