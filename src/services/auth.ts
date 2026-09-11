import type { User } from '@supabase/supabase-js'
import { db, liveCards, DEFAULT_DECK_NAME } from './db'
import { getSupabase } from './supabase'

const BOUND_USER_KEY = 'boundUserId'

/**
 * Nome informado no cadastro (`raw_user_meta_data.name` em auth.users). Contas
 * antigas ou criadas fora do formulário podem não ter — daí o recuo para o
 * trecho do e-mail antes do @.
 */
export function displayName(user: User): string {
  const name: unknown = user.user_metadata?.name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return user.email?.split('@')[0] ?? 'Conta'
}

/** Conta à qual este banco local está vinculado — vive só no Dexie, nunca sobe no sync. */
export async function getBoundUserId(): Promise<string | null> {
  const row = await db.syncState.get(BOUND_USER_KEY)
  return (row?.value as string | undefined) ?? null
}

async function setBoundUserId(id: string): Promise<void> {
  await db.syncState.put({ key: BOUND_USER_KEY, value: id })
}

/** Cursores de pull incremental, um por tabela (ver services/sync.ts). */
export const PULL_CURSOR_KEYS = ['cursor:decks', 'cursor:cards', 'cursor:reviewLogs'] as const

/**
 * O cursor guarda o `synced_at` da última linha vista — um instante do
 * relógio do servidor, não um número de versão por conta. As linhas da conta
 * nova são mais antigas que esse instante, então, sem zerar, o primeiro pull
 * depois de uma troca de conta pediria `synced_at > <cursor da conta velha>`
 * e não traria nada: a conta pareceria vazia para sempre.
 */
async function clearPullCursors(): Promise<void> {
  await db.syncState.bulkDelete([...PULL_CURSOR_KEYS])
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

  // O deck padrão intocado é descartado mesmo numa troca de conta: ele não é
  // dado do usuário, é andaime da primeira abertura, e contá-lo como "dados
  // deste aparelho" transformaria toda troca de conta num conflito falso.
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

  // Lado vazio não é conflito, nem quando o aparelho está vinculado a outra
  // conta: não há dois conjuntos de dados para escolher entre. Esta checagem
  // vem antes do `bound !== null` de propósito — com ela depois, entrar numa
  // conta recém-criada (o caso do usuário que troca de e-mail ou recria a
  // conta) só oferecia apagar os dados do aparelho.
  if (nothingLocal || nothingRemote) return { kind: 'auto-adopt' }

  // Dados dos dois lados e vínculo com outra conta: nunca mescla contas
  // diferentes.
  if (bound !== null) return { kind: 'account-switch', local, remote }

  return { kind: 'needs-prompt', local, remote }
}

export type SignInPlan = 'merge' | 'discard-local' | 'cancel'

export async function completeSignIn(userId: string, plan: SignInPlan): Promise<void> {
  if (plan === 'cancel') {
    const supabase = await getSupabase()
    await supabase.auth.signOut()
    return
  }

  // `wipeLocalData` já limpa a syncState inteira (cursores inclusive); a
  // adoção preserva os dados locais e por isso precisa zerar os cursores à
  // mão quando o aparelho estava vinculado a outra conta.
  if (plan === 'discard-local') {
    await wipeLocalData()
  } else {
    if ((await getBoundUserId()) !== null) await clearPullCursors()
    await adoptLocalData()
  }
  await setBoundUserId(userId)
}
