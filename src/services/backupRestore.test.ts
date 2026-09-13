import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { createBackup } from './backupExport'
import { BackupEmpty, BackupFileInvalid } from './backupFormat'
import { readBackup, restoreBackup, type RestorePlan } from './backupRestore'
import { DEFAULT_DECK_NAME, db, type Card, type Deck, type ReviewLog } from './db'
import { resetDb } from '../test/dbHelpers'

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Inglês',
    createdAt: 1000,
    newCardsPerDay: 20,
    youngLimit: 50,
    updatedAt: 1000,
    listenFirst: false,
    voice: 'nova',
    speechRate: 1,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    sentence: 'I gave up',
    translation: 'Eu desisti',
    hints: [],
    due: 2000,
    stability: 3.5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 3,
    lapses: 1,
    state: 2,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

function makeLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: 'l1',
    cardId: 'c1',
    deckId: 'd1',
    rating: 'good',
    reviewedAt: 1500,
    stateBefore: 1,
    scheduledDays: 1,
    durationMs: 4200,
    dirty: 0,
    ...overrides,
  }
}

/** Gera um arquivo a partir de um estado e devolve o banco ao estado anterior. */
async function backupOf(content: { decks?: Deck[]; cards?: Card[]; reviewLogs?: ReviewLog[] }): Promise<Blob> {
  await resetDb()
  await db.decks.bulkAdd(content.decks ?? [])
  await db.cards.bulkAdd(content.cards ?? [])
  await db.reviewLogs.bulkAdd(content.reviewLogs ?? [])
  const file = await createBackup({ includeNarrations: false })
  await resetDb()
  return file
}

async function backupFromAccount(accountId: string): Promise<Blob> {
  await resetDb()
  await db.syncState.put({ key: 'boundUserId', value: accountId })
  await db.decks.add(makeDeck())
  await db.cards.add(makeCard())
  const file = await createBackup({ includeNarrations: false })
  await resetDb()
  return file
}

async function restore(file: Blob, plan: RestorePlan = 'merge') {
  return restoreBackup({ preview: await readBackup(file), plan, includeNarrations: false })
}

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetDb()
})

describe('readBackup', () => {
  let file: Blob

  beforeEach(async () => {
    file = await backupOf({ decks: [makeDeck()], cards: [makeCard(), makeCard({ id: 'c2', deletedAt: 50 })] })
  })

  it('resume o conteúdo do arquivo contando só o que está vivo', async () => {
    const preview = await readBackup(file)

    expect(preview.counts).toEqual({ decks: 1, cards: 1, reviewLogs: 0, recordings: 0, narrations: 0 })
  })

  it('não altera nada no banco ao apenas ler a prévia', async () => {
    await db.cards.add(makeCard({ id: 'local' }))

    await readBackup(file)

    expect(await db.cards.count()).toBe(1)
    expect(await db.decks.count()).toBe(0)
  })

  it('rejeita arquivo que não é um backup do Lingo sem tocar no banco', async () => {
    await db.cards.add(makeCard({ id: 'local' }))

    await expect(readBackup(new Blob(['nada disso']))).rejects.toBeInstanceOf(BackupFileInvalid)
    expect(await db.cards.count()).toBe(1)
  })

  it('recusa o arquivo sem nenhum dado para restaurar', async () => {
    const vazio = await backupOf({})

    await expect(readBackup(vazio)).rejects.toBeInstanceOf(BackupEmpty)
  })

  it('sinaliza divergência quando o arquivo veio de outra conta', async () => {
    const file = await backupFromAccount('user-1')
    await db.syncState.put({ key: 'boundUserId', value: 'user-2' })

    const preview = await readBackup(file)

    expect(preview.accountMismatch).toBe(true)
  })

  it('não sinaliza divergência quando o arquivo veio da conta do aparelho', async () => {
    const file = await backupFromAccount('user-1')
    await db.syncState.put({ key: 'boundUserId', value: 'user-1' })

    const preview = await readBackup(file)

    expect(preview.accountMismatch).toBe(false)
  })

  it('não sinaliza divergência quando o aparelho não tem conta', async () => {
    const preview = await readBackup(file)

    expect(preview.accountMismatch).toBe(false)
  })

  it('conta o áudio do arquivo e soma o espaço que ele ocupa', async () => {
    await resetDb()
    await db.decks.add(makeDeck())
    await db.cards.add(makeCard())
    await db.audioBlobs.bulkAdd([
      { id: 'a1', cardId: 'c1', kind: 'tts', blob: new Blob(['narracao'], { type: 'audio/mpeg' }), createdAt: 1, voice: 'nova' },
      { id: 'r1', cardId: 'c1', kind: 'user_recording', blob: new Blob(['gravacao'], { type: 'audio/webm' }), createdAt: 2 },
    ])
    const comAudio = await createBackup({ includeNarrations: true })
    await resetDb()

    const preview = await readBackup(comAudio)

    expect(preview.counts).toMatchObject({ recordings: 1, narrations: 1 })
    expect(preview.audioBytes).toBe(new Blob(['narracao']).size + new Blob(['gravacao']).size)
  })

  it('rejeita o ZIP que não carrega um manifesto', async () => {
    const semManifesto = new JSZip()
    semManifesto.file('outra-coisa.txt', 'nada aqui')
    const file = await semManifesto.generateAsync({ type: 'blob' })

    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupFileInvalid)
  })

  it('rejeita o ZIP cujo manifesto é de outro formato', async () => {
    const impostor = new JSZip()
    impostor.file('backup.json', JSON.stringify({ format: 'anki', version: 3 }))
    const file = await impostor.generateAsync({ type: 'blob' })

    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupFileInvalid)
  })

  it('relata quantos registros o arquivo perdeu na validação', async () => {
    const preview = await readBackup(file)

    expect(preview.discarded).toBe(0)
  })
})

describe('restoreBackup — mesclar', () => {
  it('restaura baralhos, cartões e revisões num banco vazio preservando o agendamento', async () => {
    const file = await backupOf({
      decks: [makeDeck()],
      cards: [makeCard({ due: 9999, stability: 7.25, state: 2, lastReview: 4321 })],
      reviewLogs: [makeLog()],
    })

    const report = await restore(file)

    const card = (await db.cards.get('c1'))!
    expect(report.applied).toEqual({ decks: 1, cards: 1, reviewLogs: 1, audio: 0 })
    expect(card).toMatchObject({ due: 9999, stability: 7.25, state: 2, lastReview: 4321, reps: 3, lapses: 1 })
    expect((await db.decks.get('d1'))!.name).toBe('Inglês')
  })

  it('preserva o cartão local mais recente ao mesclar', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ sentence: 'do arquivo', updatedAt: 500 })] })
    await db.cards.add(makeCard({ sentence: 'do aparelho', updatedAt: 900, dirty: 0 }))

    const report = await restore(file)

    expect((await db.cards.get('c1'))!.sentence).toBe('do aparelho')
    expect(report.applied.cards).toBe(0)
  })

  it('aplica o cartão do arquivo quando ele é o mais recente', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ sentence: 'do arquivo', updatedAt: 900 })] })
    await db.cards.add(makeCard({ sentence: 'do aparelho', updatedAt: 500 }))

    await restore(file)

    expect((await db.cards.get('c1'))!.sentence).toBe('do arquivo')
  })

  it('mantém o cartão local ausente do arquivo ao mesclar', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.cards.add(makeCard({ id: 'so-local' }))

    await restore(file)

    expect((await db.cards.get('so-local'))!.deletedAt).toBe(0)
  })

  it('não duplica a revisão que o aparelho já conhece', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()], reviewLogs: [makeLog()] })
    await db.reviewLogs.add(makeLog())

    const report = await restore(file)

    expect(await db.reviewLogs.count()).toBe(1)
    expect(report.applied.reviewLogs).toBe(0)
  })

  it('marca como pendente de envio tudo o que foi aplicado', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()], reviewLogs: [makeLog()] })

    await restore(file)

    expect((await db.decks.get('d1'))!.dirty).toBe(1)
    expect((await db.cards.get('c1'))!.dirty).toBe(1)
    expect((await db.reviewLogs.get('l1'))!.dirty).toBe(1)
  })

  it('não marca como pendente o registro local que venceu a comparação', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ updatedAt: 500 })] })
    await db.cards.add(makeCard({ updatedAt: 900, dirty: 0 }))

    await restore(file)

    expect((await db.cards.get('c1'))!.dirty).toBe(0)
  })

  it('preserva o vínculo de conta e os cursores de pull após restaurar', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.syncState.bulkPut([
      { key: 'boundUserId', value: 'user-1' },
      { key: 'cursor:cards', value: '2026-01-01T00:00:00Z' },
    ])

    await restore(file)

    expect((await db.syncState.get('boundUserId'))!.value).toBe('user-1')
    expect((await db.syncState.get('cursor:cards'))!.value).toBe('2026-01-01T00:00:00Z')
  })

  it('restaura o arquivo que não tem nenhuma revisão', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })

    const report = await restore(file)

    expect(report.applied).toEqual({ decks: 1, cards: 1, reviewLogs: 0, audio: 0 })
  })

  it('restaura o arquivo que só traz cartões, sem baralho novo', async () => {
    const file = await backupOf({ cards: [makeCard()] })
    await db.decks.add(makeDeck())

    const report = await restore(file)

    expect(report.applied).toEqual({ decks: 0, cards: 1, reviewLogs: 0, audio: 0 })
  })

  it('descarta o baralho padrão intocado em vez de deixá-lo ao lado do restaurado', async () => {
    const file = await backupOf({ decks: [makeDeck({ id: 'do-arquivo' })], cards: [makeCard({ deckId: 'do-arquivo' })] })
    await db.decks.add(makeDeck({ id: 'semeado', name: DEFAULT_DECK_NAME }))

    await restore(file)

    const vivos = await db.decks.filter((d) => d.deletedAt === 0).toArray()
    expect(vivos.map((d) => d.id)).toEqual(['do-arquivo'])
  })

  it('marca o baralho padrão descartado como excluído, em vez de apagá-lo sem deixar rastro', async () => {
    const file = await backupOf({ decks: [makeDeck({ id: 'do-arquivo' })], cards: [makeCard({ deckId: 'do-arquivo' })] })
    await db.decks.add(makeDeck({ id: 'semeado', name: DEFAULT_DECK_NAME }))

    await restore(file)

    const semeado = await db.decks.get('semeado')
    expect(semeado?.deletedAt).toBeGreaterThan(0)
    expect(semeado?.dirty).toBe(1)
  })

  it('mantém o baralho padrão quando a restauração falha no meio', async () => {
    const file = await backupOf({ decks: [makeDeck({ id: 'do-arquivo' })], cards: [makeCard({ deckId: 'do-arquivo' })] })
    await db.decks.add(makeDeck({ id: 'semeado', name: DEFAULT_DECK_NAME }))
    vi.spyOn(db.cards, 'bulkPut').mockRejectedValue(new Error('escrita falhou'))

    await expect(restore(file)).rejects.toThrow('escrita falhou')

    expect(await db.decks.get('semeado')).toBeDefined()
  })

  it('preserva o baralho padrão que já tem cartões do usuário', async () => {
    const file = await backupOf({ decks: [makeDeck({ id: 'do-arquivo' })], cards: [makeCard({ deckId: 'do-arquivo' })] })
    await db.decks.add(makeDeck({ id: 'usado', name: DEFAULT_DECK_NAME }))
    await db.cards.add(makeCard({ id: 'meu', deckId: 'usado' }))

    await restore(file)

    const vivos = await db.decks.filter((d) => d.deletedAt === 0).toArray()
    expect(vivos.map((d) => d.id).sort()).toEqual(['do-arquivo', 'usado'])
  })

  it('gera e restaura sem nenhuma chamada de rede', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })

    await restore(file)

    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('restoreBackup — substituir', () => {
  it('marca como excluído o cartão local ausente do arquivo ao substituir', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(7777)
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.decks.add(makeDeck())
    await db.cards.bulkAdd([makeCard(), makeCard({ id: 'sobra' })])

    const report = await restore(file, 'replace')

    const removido = (await db.cards.get('sobra'))!
    expect(removido).toMatchObject({ deletedAt: 7777, updatedAt: 7777, dirty: 1 })
    expect(report.tombstoned).toBe(1)
  })

  it('deixa o conteúdo igual ao do arquivo mesmo quando o local é mais recente', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ sentence: 'do arquivo', updatedAt: 500 })] })
    await db.cards.add(makeCard({ sentence: 'do aparelho', updatedAt: 900 }))

    await restore(file, 'replace')

    expect((await db.cards.get('c1'))!.sentence).toBe('do arquivo')
  })

  it('carimba o momento da restauração para a substituição vencer no servidor', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(7777)
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ updatedAt: 500 })] })
    await db.cards.add(makeCard({ updatedAt: 900 }))

    await restore(file, 'replace')

    expect((await db.cards.get('c1'))!.updatedAt).toBe(7777)
  })

  it('não tombstona o baralho que o arquivo também tem', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.decks.add(makeDeck())

    const report = await restore(file, 'replace')

    expect((await db.decks.get('d1'))!.deletedAt).toBe(0)
    expect(report.tombstoned).toBe(0)
  })

  it('preserva o histórico de revisões local, que não tem como ser excluído', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.reviewLogs.add(makeLog({ id: 'so-local' }))

    await restore(file, 'replace')

    expect(await db.reviewLogs.get('so-local')).toBeDefined()
  })
})
