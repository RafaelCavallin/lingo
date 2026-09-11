import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup } from './backupExport'
import { readBackup, restoreBackup } from './backupRestore'
import { db, type AudioBlob, type Card, type Deck } from './db'
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

function narration(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return {
    id: 'a1',
    cardId: 'c1',
    kind: 'tts',
    blob: new Blob(['narracao'], { type: 'audio/mpeg' }),
    createdAt: 1200,
    voice: 'nova',
    ...overrides,
  }
}

function recording(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return {
    id: 'r1',
    cardId: 'c1',
    kind: 'user_recording',
    blob: new Blob(['gravacao do usuario'], { type: 'audio/webm' }),
    createdAt: 1300,
    ...overrides,
  }
}

/** Backup de um aparelho com um cartão e o áudio pedido, deixando o banco limpo. */
async function backupWith(blobs: AudioBlob[], card = makeCard()): Promise<Blob> {
  await resetDb()
  await db.decks.add(makeDeck())
  await db.cards.add(card)
  await db.audioBlobs.bulkAdd(blobs)
  const file = await createBackup({ includeNarrations: true })
  await resetDb()
  return file
}

async function restore(file: Blob, includeNarrations = true) {
  return restoreBackup({ preview: await readBackup(file), plan: 'merge', includeNarrations })
}

afterEach(async () => {
  vi.restoreAllMocks()
  await resetDb()
})

describe('restauração do áudio', () => {
  let file: Blob

  beforeEach(async () => {
    file = await backupWith([narration(), recording()])
  })

  it('restaura a gravação do usuário e a deixa disponível para o cartão', async () => {
    const report = await restore(file)

    const restaurada = await db.audioBlobs.where({ cardId: 'c1', kind: 'user_recording' }).first()
    expect(await restaurada!.blob.text()).toBe('gravacao do usuario')
    expect(restaurada!.blob.type).toBe('audio/webm')
    expect(report.applied.audio).toBe(2)
  })

  it('restaura a narração com a voz que a gerou, para o cache continuar valendo', async () => {
    await restore(file)

    const narracao = await db.audioBlobs.where({ cardId: 'c1', kind: 'tts' }).first()
    expect(narracao!.voice).toBe('nova')
    expect(await narracao!.blob.text()).toBe('narracao')
  })

  it('não aplica narração cuja frase mudou depois da geração', async () => {
    await db.decks.add(makeDeck())
    await db.cards.add(makeCard({ sentence: 'I gave up on it', updatedAt: 9000 }))

    const report = await restore(file)

    expect(await db.audioBlobs.where({ cardId: 'c1', kind: 'tts' }).count()).toBe(0)
    expect(await db.audioBlobs.where({ cardId: 'c1', kind: 'user_recording' }).count()).toBe(1)
    expect(report.skippedStale).toBe(1)
  })

  it('deixa o áudio de fora quando o usuário opta por não restaurar narrações', async () => {
    const report = await restore(file, false)

    expect(await db.audioBlobs.where({ kind: 'tts' }).count()).toBe(0)
    expect(report.applied.audio).toBe(1)
    expect(report.skippedStale).toBe(0)
  })

  it('descarta o áudio cujo cartão não sobreviveu à restauração', async () => {
    const semCartao = await backupWith([recording()], makeCard({ deletedAt: 800 }))

    const report = await restore(semCartao)

    expect(await db.audioBlobs.count()).toBe(0)
    expect(report.skippedStale).toBe(1)
  })

  it('descarta a entrada cujo arquivo de áudio não veio dentro do ZIP', async () => {
    const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()))
    zip.remove('audio/a1.mp3')
    const mutilado = await zip.generateAsync({ type: 'blob' })

    const report = await restore(mutilado)

    expect(report.applied.audio).toBe(1)
    expect(report.skippedStale).toBe(1)
  })

  it('restaurar duas vezes o mesmo arquivo não duplica o áudio', async () => {
    await restore(file)
    await restore(file)

    expect(await db.audioBlobs.count()).toBe(2)
  })

  it('informa o progresso da fase de áudio separado do progresso dos dados', async () => {
    const fases: string[] = []

    await restoreBackup({
      preview: await readBackup(file),
      plan: 'merge',
      includeNarrations: true,
      onProgress: (p) => fases.push(`${p.phase}:${p.done}/${p.total}`),
    })

    expect(fases).toEqual(['data:2/2', 'audio:1/2', 'audio:2/2'])
  })

  it('preserva os dados restaurados quando a gravação do áudio falha por falta de espaço', async () => {
    vi.spyOn(db.audioBlobs, 'put').mockRejectedValue(new DOMException('cheio', 'QuotaExceededError'))

    const report = await restore(file)

    expect((await db.cards.get('c1'))!.sentence).toBe('I gave up')
    expect(await db.decks.count()).toBe(1)
    expect(report.applied.cards).toBe(1)
    expect(report.applied.audio).toBe(0)
    expect(report.audioIncomplete).toBe(true)
  })

  it('mantém o áudio já gravado quando o espaço acaba no meio da fase', async () => {
    const original = db.audioBlobs.put.bind(db.audioBlobs)
    vi.spyOn(db.audioBlobs, 'put')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new DOMException('cheio', 'QuotaExceededError'))

    const report = await restore(file)

    expect(report.applied.audio).toBe(1)
    expect(report.audioIncomplete).toBe(true)
    expect(await db.audioBlobs.count()).toBe(1)
  })

  it('propaga erro que não seja falta de espaço', async () => {
    vi.spyOn(db.audioBlobs, 'put').mockRejectedValue(new Error('banco fechou'))

    await expect(restore(file)).rejects.toThrow('banco fechou')
  })
})
