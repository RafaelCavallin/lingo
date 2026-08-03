import type { SupabaseClient } from '@supabase/supabase-js'
import { db, type Card, type Deck, type ReviewLog } from './db'
import { getBoundUserId } from './auth'
import { getSupabase, isSyncConfigured } from './supabase'
import {
  parseCardRow,
  parseDeckRow,
  parseReviewLogRow,
  toCardRow,
  toDeckRow,
  toLogRow,
  type Parsed,
} from './syncRows'

/**
 * Sincronização por tabelas reais no Postgres, com RLS por usuário —
 * substitui o antigo par chave/valor no Redis. Pull antes de push: o LWW
 * local já descarta os perdedores antes de decidir o que subir.
 */

const LAST_SYNC_KEY = 'lingo.lastSync'
export const lastSyncAt = () => Number(localStorage.getItem(LAST_SYNC_KEY)) || 0

const PULL_PAGE = 500
const PUSH_CHUNK = 200
/** Absorve a janela entre o início e o commit de uma transação remota — sem
 *  isto, uma linha commitada um instante depois do início do pull sumiria
 *  para sempre. Reprocessar meia dúzia de linhas de novo é grátis: o apply é
 *  idempotente. */
const OVERLAP_MS = 5_000

export type SyncReason = 'manual' | 'signin' | 'online' | 'boot' | 'session-end'

export type SyncOutcome =
  | { status: 'ok'; pulled: number; pushed: number; at: number }
  | { status: 'offline' }
  | { status: 'signed-out' }
  | { status: 'disabled' }
  | { status: 'error'; message: string }

/**
 * Mutex entre abas: duas abas do PWA sincronizando ao mesmo tempo
 * intercalariam applies e limpariam a flag `dirty` uma da outra.
 */
export async function syncNow(reason: SyncReason): Promise<SyncOutcome> {
  if (!isSyncConfigured()) return { status: 'disabled' }
  if (!('locks' in navigator)) return runSync(reason)
  const result = await navigator.locks.request('lingo-sync', { ifAvailable: true }, (lock) =>
    lock ? runSync(reason) : Promise.resolve<SyncOutcome>({ status: 'ok', pulled: 0, pushed: 0, at: Date.now() }),
  )
  return result
}

async function runSync(_reason: SyncReason): Promise<SyncOutcome> {
  const bound = await getBoundUserId()
  if (!bound) return { status: 'signed-out' }

  let supabase: SupabaseClient
  try {
    supabase = await getSupabase()
  } catch {
    return { status: 'disabled' }
  }

  let session
  try {
    const { data } = await supabase.auth.getSession()
    session = data.session
  } catch {
    return { status: 'offline' }
  }
  if (!session) return { status: 'signed-out' }
  if (session.user.id !== bound) {
    return { status: 'error', message: 'A sessão atual não é a conta vinculada a este aparelho.' }
  }

  try {
    let pulled = 0
    pulled += await pullTable(supabase, 'decks', 'cursor:decks', applyDecks)
    pulled += await pullTable(supabase, 'cards', 'cursor:cards', applyCards)
    pulled += await pullTable(supabase, 'review_logs', 'cursor:reviewLogs', applyReviewLogs)
    const pushed = await pushDirty(supabase)
    const at = Date.now()
    localStorage.setItem(LAST_SYNC_KEY, String(at))
    return { status: 'ok', pulled, pushed, at }
  } catch (e) {
    if (isNetworkError(e)) return { status: 'offline' }
    return { status: 'error', message: e instanceof Error ? e.message : 'A sincronização falhou.' }
  }
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /fetch|network/i.test(e.message))
}

// ---------- pull ----------

/**
 * Keyset em `synced_at`, não offset: outro aparelho escrevendo entre páginas
 * faria uma paginação por offset pular linhas. O cursor só avança dentro da
 * mesma transação Dexie que aplica as linhas (ver applyX abaixo) — um crash
 * no meio replica a página, nunca a pula.
 */
async function pullTable(
  supabase: SupabaseClient,
  table: 'decks' | 'cards' | 'review_logs',
  cursorKey: string,
  apply: (rows: unknown[], cursorKey: string) => Promise<number>,
): Promise<number> {
  const stored = await db.syncState.get(cursorKey)
  let from = stored?.value
    ? new Date(Date.parse(String(stored.value)) - OVERLAP_MS).toISOString()
    : '1970-01-01T00:00:00Z'
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('synced_at', from)
      .order('synced_at', { ascending: true })
      .limit(PULL_PAGE)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) break

    // O overlap de 5s faz toda sincronização reprocessar as últimas linhas
    // já conhecidas — inofensivo (idempotente), mas `apply` devolve só quem
    // de fato mudou algo localmente, pra "3 registros vieram" não aparecer
    // toda vez que nada realmente mudou.
    total += await apply(rows, cursorKey)
    from = (rows[rows.length - 1] as { synced_at: string }).synced_at
    if (rows.length < PULL_PAGE) break
  }
  return total
}

function keepParsed<T>(items: (Parsed<T> | null)[]): Parsed<T>[] {
  return items.filter((x): x is Parsed<T> => x !== null)
}

/** Desempate determinístico por id quando `updatedAt` empata — sem isto, dois
 *  aparelhos editando no mesmo milissegundo nunca convergem: cada um rejeita
 *  o outro como "não mais novo". */
function wins(remote: { id: string; updatedAt: number }, local: { id: string; updatedAt: number } | undefined) {
  if (!local) return true
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt
  return remote.id > local.id
}

async function applyDecks(rows: unknown[], cursorKey: string): Promise<number> {
  const parsed = keepParsed(rows.map(parseDeckRow))
  if (parsed.length === 0) return 0
  return db.transaction('rw', db.decks, db.syncState, async () => {
    const locals = await db.decks.bulkGet(parsed.map((p) => p.row.id))
    const winners = parsed.filter((p, i) => wins(p.row, locals[i]))
    if (winners.length) await db.decks.bulkPut(winners.map((w) => w.row))
    await db.syncState.put({ key: cursorKey, value: parsed[parsed.length - 1].syncedAt })
    return winners.length
  })
}

async function applyCards(rows: unknown[], cursorKey: string): Promise<number> {
  const parsed = keepParsed(rows.map(parseCardRow))
  if (parsed.length === 0) return 0
  return db.transaction('rw', db.cards, db.syncState, async () => {
    const locals = await db.cards.bulkGet(parsed.map((p) => p.row.id))
    const winners = parsed.filter((p, i) => wins(p.row, locals[i]))
    if (winners.length) await db.cards.bulkPut(winners.map((w) => w.row))
    await db.syncState.put({ key: cursorKey, value: parsed[parsed.length - 1].syncedAt })
    return winners.length
  })
}

/** Imutáveis: união por id, nunca sobrescreve uma linha já presente. */
async function applyReviewLogs(rows: unknown[], cursorKey: string): Promise<number> {
  const parsed = keepParsed(rows.map(parseReviewLogRow))
  if (parsed.length === 0) return 0
  return db.transaction('rw', db.reviewLogs, db.syncState, async () => {
    const locals = await db.reviewLogs.bulkGet(parsed.map((p) => p.row.id))
    const fresh = parsed.filter((_, i) => !locals[i])
    if (fresh.length) await db.reviewLogs.bulkAdd(fresh.map((f) => f.row))
    await db.syncState.put({ key: cursorKey, value: parsed[parsed.length - 1].syncedAt })
    return fresh.length
  })
}

// ---------- push ----------

/**
 * `sync_push` é uma RPC transacional (decks → cards → logs numa transação só,
 * com `where excluded.updated_at > t.updated_at` no servidor) — um `.upsert()`
 * comum do PostgREST não tem `WHERE` e sobrescreveria cegamente o que outro
 * aparelho tiver escrito de mais novo entre o pull e o push.
 */
async function pushDirty(supabase: SupabaseClient): Promise<number> {
  const [decks, cards, logs] = await Promise.all([
    db.decks.filter((d) => d.dirty === 1).toArray(),
    db.cards.filter((c) => c.dirty === 1).toArray(),
    db.reviewLogs.filter((l) => l.dirty === 1).toArray(),
  ])
  if (decks.length === 0 && cards.length === 0 && logs.length === 0) return 0

  const cardChunks = chunk(cards, PUSH_CHUNK)
  const logChunks = chunk(logs, PUSH_CHUNK)
  const rounds = Math.max(1, cardChunks.length, logChunks.length)
  let pushed = 0
  let sentDecks = false

  for (let i = 0; i < rounds; i++) {
    const cChunk = cardChunks[i] ?? []
    const lChunk = logChunks[i] ?? []
    const { error } = await supabase.rpc('sync_push', {
      p_decks: sentDecks ? [] : decks.map(toDeckRow),
      p_cards: cChunk.map(toCardRow),
      p_logs: lChunk.map(toLogRow),
    })
    if (error) throw error
    sentDecks = true
    await clearDirty(db.cards, cChunk)
    // Logs são imutáveis — nada pode tê-los editado em trânsito, então a
    // flag é limpa direto, sem o compare-and-swap usado em decks/cards.
    if (lChunk.length) await db.reviewLogs.bulkUpdate(lChunk.map((l) => ({ key: l.id, changes: { dirty: 0 } })))
    pushed += cChunk.length + lChunk.length
  }
  if (decks.length) {
    await clearDirty(db.decks, decks)
    pushed += decks.length
  }
  return pushed
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Compare-and-swap no `updatedAt`: se o usuário editou o registro durante o
 * próprio push (ex.: avaliou o card enquanto ele estava em trânsito), a
 * edição fica presa em `dirty: 1` em vez de ser silenciosamente perdida —
 * sobe no próximo ciclo.
 */
async function clearDirty<T extends { id: string; updatedAt: number }>(
  table: { bulkGet: (ids: string[]) => Promise<(T | undefined)[]>; update: (id: string, changes: object) => Promise<number> },
  sent: T[],
): Promise<void> {
  if (sent.length === 0) return
  const now = await table.bulkGet(sent.map((r) => r.id))
  const stillUnchanged = sent.filter((r, i) => now[i] && now[i]!.updatedAt === r.updatedAt)
  for (const r of stillUnchanged) await table.update(r.id, { dirty: 0 })
}

export type { Deck, Card, ReviewLog }
