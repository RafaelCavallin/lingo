import { db, liveCards, DEFAULT_DECK_NAME } from './db'
import { getSupabase } from './supabase'

const BOUND_USER_KEY = 'boundUserId'

/** Conta à qual este banco local está vinculado — vive só no Dexie, nunca sobe no sync. */
export async function getBoundUserId(): Promise<string | null> {
  const row = await db.syncState.get(BOUND_USER_KEY)
  return (row?.value as string | undefined) ?? null
}

async function setBoundUserId(id: string): Promise<void> {
  await db.syncState.put({ key: BOUND_USER_KEY, value: id })
}

export interface DataSummary {
  decks: number
  cards: number
  reviewLogs: number
}

async function localSummary(): Promise<DataSummary> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.filter((d) => d.deletedAt === 0).count(),
    db.cards.filter((c) => c.deletedAt === 0).count(),
    db.reviewLogs.count(),
  ])
  return { decks, cards, reviewLogs }
}

/** RLS já escopa por auth.uid() — não precisa filtrar user_id explicitamente aqui. */
async function remoteSummary(): Promise<DataSummary> {
  const supabase = await getSupabase()
  const [decks, cards, reviewLogs] = await Promise.all([
    supabase.from('decks').select('id', { count: 'exact', head: true }).eq('deleted_at', 0),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deleted_at', 0),
    supabase.from('review_logs').select('id', { count: 'exact', head: true }),
  ])
  return { decks: decks.count ?? 0, cards: cards.count ?? 0, reviewLogs: reviewLogs.count ?? 0 }
}

/**
 * Caso mais comum de todos: instalou o app, nunca mexeu em nada, cadastrou.
 * Sem isto, todo cadastro novo criaria um segundo deck "Frases em inglês"
 * ao lado do que a conta já tiver (ou vai ter, no próximo aparelho).
 */
async function isUntouchedDefaultDeck(): Promise<boolean> {
  const decks = await db.decks.filter((d) => d.deletedAt === 0).toArray()
  if (decks.length !== 1 || decks[0].name !== DEFAULT_DECK_NAME) return false
  const [cardCount, logCount] = await Promise.all([
    liveCards(decks[0].id).count(),
    db.reviewLogs.where('deckId').equals(decks[0].id).count(),
  ])
  return cardCount === 0 && logCount === 0
}

/** Marca tudo como pendente de envio — nunca toca `updatedAt` (ver services/auth.ts). */
async function adoptLocalData(): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    await db.decks.toCollection().modify({ dirty: 1 })
    await db.cards.toCollection().modify({ dirty: 1 })
    await db.reviewLogs.toCollection().modify({ dirty: 1 })
  })
}

/** Troca de conta: nunca mescla dados de contas diferentes. Apaga tudo localmente antes do próximo pull. */
async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, db.audioBlobs, db.syncState, async () => {
    await db.decks.clear()
    await db.cards.clear()
    await db.reviewLogs.clear()
    await db.audioBlobs.clear()
    await db.syncState.clear()
  })
}

export type SignInDecision =
  | { kind: 'resume' }
  | { kind: 'auto-adopt' }
  | { kind: 'needs-prompt'; local: DataSummary; remote: DataSummary }
  | { kind: 'account-switch'; local: DataSummary; remote: DataSummary }

/**
 * Chamado no evento SIGNED_IN, nunca no retorno de signUp()/signInWithPassword()
 * diretamente — com confirmação de email ligada, signUp() não traz sessão, e
 * decidir com base nisso deixaria a adoção presa num estado que nunca conclui.
 */
export async function decideOnSignIn(userId: string): Promise<SignInDecision> {
  const bound = await getBoundUserId()
  if (bound === userId) return { kind: 'resume' }

  if (bound !== null) {
    return { kind: 'account-switch', local: await localSummary(), remote: await remoteSummary() }
  }

  if (await isUntouchedDefaultDeck()) {
    await db.transaction('rw', db.decks, db.cards, async () => {
      await db.decks.clear()
      await db.cards.clear()
    })
  }

  const local = await localSummary()
  const remote = await remoteSummary()
  const nothingLocal = local.decks === 0 && local.cards === 0 && local.reviewLogs === 0
  const nothingRemote = remote.decks === 0 && remote.cards === 0 && remote.reviewLogs === 0
  if (nothingLocal || nothingRemote) return { kind: 'auto-adopt' }
  return { kind: 'needs-prompt', local, remote }
}

export type SignInPlan = 'merge' | 'discard-local' | 'cancel'

export async function completeSignIn(userId: string, plan: SignInPlan): Promise<void> {
  if (plan === 'cancel') {
    const supabase = await getSupabase()
    await supabase.auth.signOut()
    return
  }
  if (plan === 'discard-local') await wipeLocalData()
  else await adoptLocalData()
  await setBoundUserId(userId)
}
