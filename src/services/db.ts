import Dexie, { type EntityTable } from 'dexie'
import { State } from 'ts-fsrs'

export type HintType = 'phrasal_verb' | 'false_cognate' | 'pronunciation' | 'custom'

export interface Hint {
  type: HintType
  text: string
  source: 'ai' | 'user'
}

export interface Deck {
  id: string
  name: string
  createdAt: number
  newCardsPerDay: number
  youngLimit: number
  updatedAt: number
  listenFirst: boolean
  voice: string
  /** Velocidade da narração automática (1 = velocidade natural da voz). */
  speechRate: number
  /** Parâmetros do FSRS otimizados sobre o histórico real. Vazio = padrão. */
  fsrsParams?: number[]
  paramsOptimizedAt?: number
  /** 0 = vivo. Nunca `undefined`: o IndexedDB omite do índice quem tiver isso. */
  deletedAt: number
  /** Marcado por hook (ver abaixo), não pelos pontos de escrita. */
  dirty: 0 | 1
}

export interface Card {
  id: string
  deckId: string
  sentence: string
  translation: string
  /** Transcrição fonética, sem barras — `ˈbərd(ə)n`. Ausente quando vazia. */
  phonetic?: string
  hints: Hint[]
  clozeRanges?: { start: number; end: number }[]
  /** Trechos em destaque na frase — mesmos offsets, nunca sobrepostos às lacunas. */
  emphasisRanges?: { start: number; end: number }[]
  /** Trechos em destaque na tradução. */
  translationEmphasisRanges?: { start: number; end: number }[]
  // Estado FSRS — sempre escrito pelo scheduler, nunca à mão.
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: State
  lastReview?: number
  createdAt: number
  updatedAt: number
  /** 0 = vivo. Nunca `undefined`: o IndexedDB omite do índice quem tiver isso. */
  deletedAt: number
  dirty: 0 | 1
}

export interface ReviewLog {
  id: string
  cardId: string
  /** Denormalizado de card.deckId — permite escopar estatísticas por deck sem join. */
  deckId: string
  rating: 'again' | 'good'
  reviewedAt: number
  stateBefore: State
  scheduledDays: number
  durationMs: number
  dirty: 0 | 1
}

/** Cursores de sync e vínculo de conta — nunca sincronizado. */
export interface SyncState {
  key: string
  value: string | number | null
}

export interface AudioBlob {
  id: string
  cardId: string
  kind: 'tts' | 'tts_slow' | 'user_recording'
  blob: Blob
  createdAt: number
  /** Voz usada na narração: trocar de voz invalida o cache. */
  voice?: string
}

export const db = new Dexie('lingo') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  audioBlobs: EntityTable<AudioBlob, 'id'>
  syncState: EntityTable<SyncState, 'key'>
}

db.version(1).stores({
  decks: 'id, name, createdAt',
  cards: 'id, deckId, due, state, createdAt',
  reviewLogs: 'id, cardId, reviewedAt',
  audioBlobs: 'id, cardId, kind',
})

db.version(2)
  .stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, updatedAt',
    reviewLogs: 'id, cardId, reviewedAt',
    audioBlobs: 'id, cardId, kind, voice',
  })
  .upgrade(async (tx) => {
    const now = Date.now()
    await tx.table('cards').toCollection().modify((c: Card) => {
      c.updatedAt ??= c.lastReview ?? c.createdAt ?? now
    })
    await tx.table('decks').toCollection().modify((d: Deck) => {
      d.updatedAt ??= now
      d.listenFirst ??= false
      d.voice ??= DEFAULT_VOICE
    })
  })

db.version(3)
  .stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, updatedAt',
    reviewLogs: 'id, cardId, reviewedAt',
    audioBlobs: 'id, cardId, kind, voice',
  })
  .upgrade(async (tx) => {
    await tx.table('decks').toCollection().modify((d: Deck) => {
      d.speechRate ??= DEFAULT_RATE
    })
  })

/**
 * Fase 5 — sincronização via Supabase. `dirty` marca o que falta empurrar;
 * `deletedAt` é o tombstone de exclusão (0 = vivo). `syncState` guarda
 * cursores de pull e a conta à qual este banco local está vinculado.
 *
 * O backfill marca tudo como `dirty = 0`, não `1`: a adoção de dados no
 * cadastro/login é que decide o que precisa subir, e ela faz isso
 * explicitamente (ver services/auth.ts). Se o backfill já marcasse `dirty:1`,
 * todo usuário existente empurraria o banco inteiro no primeiro sync depois
 * de nunca ter tido conta.
 */
db.version(4)
  .stores({
    decks: 'id, name, createdAt, dirty, deletedAt',
    cards: 'id, deckId, due, state, createdAt, updatedAt, dirty, deletedAt, [deckId+deletedAt]',
    reviewLogs: 'id, cardId, deckId, reviewedAt, dirty',
    audioBlobs: 'id, cardId, kind, voice',
    syncState: 'key',
  })
  .upgrade(async (tx) => {
    await tx.table('decks').toCollection().modify((d: Deck) => {
      d.dirty = 0
      d.deletedAt ??= 0
    })
    await tx.table('cards').toCollection().modify((c: Card) => {
      c.dirty = 0
      c.deletedAt ??= 0
    })
    const cards = (await tx.table('cards').toArray()) as Card[]
    const deckByCardId = new Map(cards.map((c) => [c.id, c.deckId]))
    await tx.table('reviewLogs').toCollection().modify((l: ReviewLog) => {
      l.dirty = 0
      l.deckId ??= deckByCardId.get(l.cardId) ?? ''
    })
  })

/**
 * `dirty` é marcado aqui, não em cada ponto de escrita — depender de todo
 * call site lembrar é como essa marca apodrece. O apply do pull do sync
 * grava linhas remotas com `dirty: 0` explícito; o sentinela abaixo respeita
 * isso (não sobrescreve quando o caller já nomeou `dirty`).
 */
function trackDirty<T extends { dirty?: 0 | 1; deletedAt?: number }, K extends keyof T>(
  table: EntityTable<T, K>,
  hasDeletedAt: boolean,
) {
  table.hook('creating', (_pk, obj) => {
    if (obj.dirty === undefined) obj.dirty = 1
    if (hasDeletedAt && obj.deletedAt === undefined) obj.deletedAt = 0
  })
  table.hook('updating', (mods) => {
    if ('dirty' in (mods as object)) return undefined
    return { dirty: 1 }
  })
}

trackDirty(db.decks, true)
trackDirty(db.cards, true)
trackDirty(db.reviewLogs, false)

export const DEFAULT_VOICE = 'nova'
export const DEFAULT_RATE = 1
/** Abaixo de 0,6 a fala perde a prosódia e atrapalha mais do que ajuda. */
export const MIN_RATE = 0.6
export const MAX_RATE = 1.2
export const VOICES = [
  { id: 'nova', label: 'Nova', note: 'feminina, clara' },
  { id: 'alloy', label: 'Alloy', note: 'neutra, equilibrada' },
  { id: 'shimmer', label: 'Shimmer', note: 'feminina, suave' },
  { id: 'onyx', label: 'Onyx', note: 'masculina, grave' },
]

export const uid = () => crypto.randomUUID()

/** Nome do baralho semeado na primeira abertura — usado também para reconhecer que
 *  um baralho é "o padrão intocado" na adoção de dados ao entrar numa conta. */
export const DEFAULT_DECK_NAME = 'Frases em inglês'

/**
 * Baralho padrão só na primeiríssima abertura — quando o banco nunca teve
 * nenhum deck, nem tombstoned. O check é por `count()` sem filtro de
 * `deletedAt` de propósito: se checasse só decks vivos, apagar o último
 * deck do usuário faria esta função recriar um deck fantasma no próximo
 * carregamento, que seria empurrado para todo outro aparelho no sync.
 * Excluir o último deck é uma decisão válida do usuário; `null` significa
 * "sem baralho agora", não "erro".
 */
export async function ensureDefaultDeck(): Promise<Deck | null> {
  // Transação: sem isso, duas chamadas concorrentes (o StrictMode do React
  // monta o efeito duas vezes em dev; duas abas abrindo o app pela primeira
  // vez ao mesmo tempo fariam o mesmo em produção) leem `count() === 0` antes
  // de qualquer uma escrever, e ambas criam um deck padrão duplicado.
  return db.transaction('rw', db.decks, async () => {
    const everHadAnyDeck = (await db.decks.count()) > 0
    if (everHadAnyDeck) {
      return (await db.decks.filter((d) => d.deletedAt === 0).first()) ?? null
    }
    const deck: Deck = {
      id: uid(),
      name: DEFAULT_DECK_NAME,
      createdAt: Date.now(),
      newCardsPerDay: 20,
      youngLimit: 50,
      updatedAt: Date.now(),
      listenFirst: false,
      voice: DEFAULT_VOICE,
      speechRate: DEFAULT_RATE,
      deletedAt: 0,
      dirty: 1,
    }
    await db.decks.add(deck)
    return deck
  })
}

/** Cartões vivos de um deck. Ponto único de leitura — nenhum outro lugar deve filtrar `deletedAt` à mão. */
export function liveCards(deckId: string) {
  return db.cards.where('[deckId+deletedAt]').equals([deckId, 0])
}

const INSERT_CHUNK_SIZE = 200

/**
 * Insere em lotes, não num único `bulkAdd` — usado pela importação do Anki,
 * onde `onProgress` é o que faz a barra da fase "criando os cartões" sair de
 * 0%. Um `bulkAdd` só resolveria (e só emitiria) quando os milhares de
 * cartões já estivessem todos gravados.
 *
 * Cada lote é a sua própria transação, então uma falha no meio (colisão de
 * chave, quota, IndexedDB) deixaria os lotes anteriores gravados pela metade.
 * O `catch` desfaz o que já entrou antes de repropagar, para a importação
 * continuar tudo-ou-nada apesar do chunking.
 */
export async function insertCardsInChunks(cards: Card[], onProgress?: (done: number) => void): Promise<void> {
  const insertedIds: string[] = []
  try {
    for (let i = 0; i < cards.length; i += INSERT_CHUNK_SIZE) {
      const chunk = cards.slice(i, i + INSERT_CHUNK_SIZE)
      await db.cards.bulkAdd(chunk)
      insertedIds.push(...chunk.map((c) => c.id))
      onProgress?.(Math.min(i + INSERT_CHUNK_SIZE, cards.length))
    }
  } catch (e) {
    if (insertedIds.length > 0) await db.cards.bulkDelete(insertedIds)
    throw e
  }
}

/**
 * Excluir é uma edição comum, não uma operação especial: `deletedAt` sobe
 * junto com `updatedAt` e percorre o mesmo caminho de last-write-wins do
 * sync que qualquer outro campo. Nunca é purgado — um aparelho que só volta
 * a sincronizar meses depois ainda precisa ver a exclusão.
 */
export async function deleteCard(cardId: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.cards, db.audioBlobs, async () => {
    await db.cards.update(cardId, { deletedAt: now, updatedAt: now })
    const blobs = await db.audioBlobs.where('cardId').equals(cardId).toArray()
    await db.audioBlobs.bulkDelete(blobs.map((b) => b.id))
  })
}

/**
 * Edita só o conteúdo do cartão — os campos FSRS são território exclusivo do
 * scheduler: editar uma frase não é uma resposta e não pode mexer no
 * agendamento nem gerar reviewLog. Se a frase mudou, todo áudio do card cai
 * (TTS e gravações do usuário narram o texto antigo); a UI re-aquece o TTS.
 */
export async function updateCard(
  cardId: string,
  changes: {
    sentence: string
    translation: string
    phonetic?: string
    hints: Hint[]
    clozeRanges?: { start: number; end: number }[]
    emphasisRanges?: { start: number; end: number }[]
    translationEmphasisRanges?: { start: number; end: number }[]
  },
): Promise<void> {
  await db.transaction('rw', db.cards, db.audioBlobs, async () => {
    const current = await db.cards.get(cardId)
    if (!current) return
    await db.cards.update(cardId, {
      sentence: changes.sentence,
      translation: changes.translation,
      phonetic: changes.phonetic?.trim() || undefined,
      hints: changes.hints,
      clozeRanges: changes.clozeRanges?.length ? changes.clozeRanges : undefined,
      emphasisRanges: changes.emphasisRanges?.length ? changes.emphasisRanges : undefined,
      translationEmphasisRanges: changes.translationEmphasisRanges?.length
        ? changes.translationEmphasisRanges
        : undefined,
      updatedAt: Date.now(),
    })
    if (changes.sentence !== current.sentence) {
      const blobs = await db.audioBlobs.where('cardId').equals(cardId).toArray()
      await db.audioBlobs.bulkDelete(blobs.map((b) => b.id))
    }
  })
}

/**
 * Tombstona o deck e todos os seus cards na mesma transação local. Não
 * cascateia no servidor: reescrever `synced_at` de milhares de linhas
 * empurraria todas para o próximo pull de todo outro aparelho. Um card
 * criado em outro aparelho depois desta exclusão fica órfão e vivo — some
 * da UI porque o deck sumiu, mas reaparece se o deck for restaurado.
 */
export async function deleteDeck(deckId: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.decks, db.cards, db.audioBlobs, async () => {
    await db.decks.update(deckId, { deletedAt: now, updatedAt: now })
    const cardIds = await liveCards(deckId).primaryKeys()
    await db.cards.where('id').anyOf(cardIds).modify({ deletedAt: now, updatedAt: now })
    const blobs = await db.audioBlobs.where('cardId').anyOf(cardIds).toArray()
    await db.audioBlobs.bulkDelete(blobs.map((b) => b.id))
  })
}
