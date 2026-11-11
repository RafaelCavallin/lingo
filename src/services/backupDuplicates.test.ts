import { afterEach, describe, expect, it } from 'vitest'
import { duplicateKey, findDuplicateIds, normalizeText, type DuplicateCandidate } from './backupDuplicates'
import { readBackup } from './backupPreview'
import { restoreBackup } from './backupRestore'
import type { RestorePlan } from './backupTypes'
import { db } from './db'
import { backupOf, makeCard, makeDeck, makeLog, seedRecordings } from '../test/backupFixtures'
import { resetDb } from '../test/dbHelpers'

function candidate(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    id: 'file-1',
    deckId: 'd1',
    sentence: "I'm looking forward to it.",
    translation: 'Estou ansioso por isso.',
    ...overrides,
  }
}

function duplicatesOf(incoming: DuplicateCandidate, local: DuplicateCandidate): string[] {
  return findDuplicateIds({ incoming: [incoming], local: [local] })
}

describe('normalizeText', () => {
  it('ignora caixa, espaços repetidos e pontuação final, mas preserva acento e apóstrofo', () => {
    const result = normalizeText("  I'm  Looking  forward to it. ")

    expect(result).toBe("i'm looking forward to it")
  })

  it('remove a pontuação final repetida e o espaço que sobra antes dela', () => {
    expect(normalizeText('Really ?!')).toBe('really')
    expect(normalizeText('Não…')).toBe('não')
  })
})

describe('findDuplicateIds', () => {
  it('trata como duplicata a frase e a tradução iguais após normalizar', () => {
    const incoming = candidate({ sentence: "i'm looking forward to it", translation: 'Estou ansioso por isso' })

    expect(duplicatesOf(incoming, candidate({ id: 'local-1' }))).toEqual(['file-1'])
  })

  it('não trata como duplicata a mesma frase com tradução diferente', () => {
    const incoming = candidate({ translation: 'Aguardo com ansiedade.' })

    expect(duplicatesOf(incoming, candidate({ id: 'local-1' }))).toEqual([])
  })

  it('não trata como duplicata a mesma frase com lacunas diferentes', () => {
    const local = candidate({ id: 'local-1', clozeRanges: [{ start: 0, end: 3 }] })
    const incoming = candidate({ clozeRanges: [{ start: 4, end: 11 }] })

    expect(duplicatesOf(incoming, local)).toEqual([])
  })

  it('não trata como duplicata o cartão com cloze contra o sem cloze, nos dois sentidos', () => {
    const withCloze = candidate({ id: 'local-1', clozeRanges: [{ start: 0, end: 3 }] })

    expect(duplicatesOf(candidate(), withCloze)).toEqual([])
    expect(duplicatesOf(withCloze, candidate())).toEqual([])
  })

  it('trata como duplicata as mesmas lacunas mesmo com os offsets deslocados por espaços', () => {
    const local = candidate({ id: 'local-1', sentence: 'I gave up', clozeRanges: [{ start: 2, end: 6 }] })
    const incoming = candidate({ sentence: ' I  gave up', clozeRanges: [{ start: 4, end: 8 }] })

    expect(duplicatesOf(incoming, local)).toEqual(['file-1'])
  })

  it('não compara cartões de baralhos diferentes', () => {
    const incoming = candidate({ deckId: 'd2' })

    expect(duplicatesOf(incoming, candidate({ id: 'local-1' }))).toEqual([])
  })

  it('gera chaves iguais para as lacunas listadas em ordem diferente', () => {
    const ranges = [{ start: 0, end: 1 }, { start: 2, end: 6 }]
    const a = candidate({ sentence: 'I gave up', clozeRanges: ranges })
    const b = candidate({ sentence: 'I gave up', clozeRanges: [...ranges].reverse() })

    expect(duplicateKey(a)).toBe(duplicateKey(b))
  })
})

const LOCAL_FSRS = { due: 5000, stability: 9.5, difficulty: 3, reps: 8, lapses: 0, state: 2 }
const FILE_FSRS = { due: 7777, stability: 1.5, difficulty: 8, reps: 1, lapses: 1, state: 1 }

const localCard = () => makeCard({ id: 'local-1', sentence: "I'm looking forward to it.", translation: 'Estou ansioso por isso.', ...LOCAL_FSRS })
const fileCard = () => makeCard({ id: 'file-1', sentence: "i'm looking forward to it", translation: 'Estou ansioso por isso', ...FILE_FSRS })

async function seedLocal() {
  await db.decks.add(makeDeck())
  await db.cards.add({ ...localCard(), dirty: 0 })
  await db.reviewLogs.add(makeLog({ id: 'local-log', cardId: 'local-1' }))
  await seedRecordings([{ id: 'rec-local', cardId: 'local-1' }])
}

async function fileWithDuplicate() {
  return backupOf({
    decks: [makeDeck()],
    cards: [fileCard()],
    reviewLogs: [makeLog({ id: 'file-log', cardId: 'file-1' })],
    recordings: [{ id: 'rec-file', cardId: 'file-1' }],
  })
}

async function run(file: Blob, options: { plan?: RestorePlan; skipDuplicates?: boolean }) {
  const preview = await readBackup(file)
  return restoreBackup({ preview, plan: options.plan ?? 'merge', includeNarrations: false, ...options })
}

afterEach(async () => {
  await resetDb()
})

describe('duplicatas na prévia', () => {
  it('conta a duplicata, informa a frase e o baralho e não escreve nada', async () => {
    const file = await fileWithDuplicate()
    await seedLocal()

    const preview = await readBackup(file)

    expect(preview.duplicates).toEqual({
      cardIds: ['file-1'],
      items: [{ sentence: "i'm looking forward to it", deckName: 'Inglês' }],
    })
    expect(await db.cards.count()).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('devolve a lista vazia quando nenhuma frase se repete', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [fileCard()] })
    await db.decks.add(makeDeck())
    await db.cards.add(makeCard({ id: 'local-1', sentence: 'Outra frase', translation: 'Outra' }))

    const preview = await readBackup(file)

    expect(preview.duplicates).toEqual({ cardIds: [], items: [] })
  })

  it('ignora o cartão local excluído e o cartão do arquivo com o mesmo id do local', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [fileCard(), makeCard({ id: 'mesmo-id', sentence: 'Igual', translation: 'Igual' })] })
    await db.decks.add(makeDeck())
    await db.cards.bulkAdd([
      { ...localCard(), deletedAt: 900 },
      makeCard({ id: 'mesmo-id', sentence: 'Igual', translation: 'Igual' }),
    ])

    const preview = await readBackup(file)

    expect(preview.duplicates.cardIds).toEqual([])
  })
})

describe('restoreBackup — duplicatas', () => {
  it('pulando duplicatas não grava o cartão, as revisões nem a gravação do arquivo', async () => {
    const file = await fileWithDuplicate()
    await seedLocal()
    const localBefore = await db.cards.get('local-1')

    const report = await run(file, { skipDuplicates: true })

    expect(await db.cards.toArray()).toEqual([localBefore])
    expect((await db.reviewLogs.toArray()).map((log) => log.id)).toEqual(['local-log'])
    expect((await db.audioBlobs.toArray()).map((audio) => audio.id)).toEqual(['rec-local'])
    expect(report.duplicates).toEqual({ cards: 1, reviewLogs: 1, audio: 1, skipped: true })
    expect(report.skippedStale).toBe(0)
  })

  it('importando mesmo assim grava os dois cartões, cada um com o próprio agendamento', async () => {
    const file = await fileWithDuplicate()
    await seedLocal()

    const report = await run(file, { skipDuplicates: false })

    const cards = await db.cards.orderBy('id').toArray()
    expect(cards.map((card) => [card.id, card.due, card.dirty])).toEqual([
      ['file-1', 7777, 1],
      ['local-1', 5000, 0],
    ])
    expect(report.duplicates).toEqual({ cards: 1, reviewLogs: 0, audio: 0, skipped: false })
    expect(await db.reviewLogs.count()).toBe(2)
    expect(await db.audioBlobs.count()).toBe(2)
  })

  it('substituir ignora a detecção e deixa o conteúdo do arquivo', async () => {
    const file = await fileWithDuplicate()
    await seedLocal()

    const report = await run(file, { plan: 'replace', skipDuplicates: true })

    const alive = await db.cards.filter((card) => card.deletedAt === 0).toArray()
    expect(alive.map((card) => card.id)).toEqual(['file-1'])
    expect(report.duplicates.cards).toBe(0)
  })

  it('recalcula na escrita: o cartão local excluído depois da prévia não bloqueia a importação', async () => {
    const file = await fileWithDuplicate()
    await seedLocal()
    const preview = await readBackup(file)
    await db.cards.update('local-1', { deletedAt: 900 })

    const report = await restoreBackup({ preview, plan: 'merge', includeNarrations: false, skipDuplicates: true })

    expect(preview.duplicates.cardIds).toEqual(['file-1'])
    expect((await db.cards.get('file-1'))?.deletedAt).toBe(0)
    expect(report.duplicates.cards).toBe(0)
    expect(report.applied.cards).toBe(1)
  })
})
