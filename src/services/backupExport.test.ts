import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, downloadBackup } from './backupExport'
import { BACKUP_FORMAT, BACKUP_VERSION, MANIFEST_PATH } from './backupFormat'
import { parseManifest } from './backupManifest'
import { db, type AudioBlob, type Card, type Deck, type ReviewLog } from './db'
import { resetDb, stubObjectUrl } from '../test/dbHelpers'

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

function makeBlob(overrides: Partial<AudioBlob> = {}): AudioBlob {
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

function makeRecording(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return makeBlob({
    id: 'r1',
    kind: 'user_recording',
    blob: new Blob(['gravacao do usuario'], { type: 'audio/webm;codecs=opus' }),
    voice: undefined,
    ...overrides,
  })
}

async function readZip(file: Blob) {
  const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()))
  const raw = await zip.file(MANIFEST_PATH)!.async('string')
  return { zip, manifest: parseManifest(JSON.parse(raw) as unknown)! }
}

let restoreObjectUrl = () => {}

beforeEach(async () => {
  await db.decks.add(makeDeck())
  await db.cards.add(makeCard())
  await db.reviewLogs.add(makeLog())
})

afterEach(async () => {
  restoreObjectUrl()
  restoreObjectUrl = () => {}
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetDb()
})

describe('createBackup', () => {
  it('gera um ZIP com manifesto válido e o arquivo de cada gravação', async () => {
    await db.audioBlobs.add(makeRecording())

    const { zip, manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.decks.map((d) => d.id)).toEqual(['d1'])
    expect(manifest.cards.map((c) => c.id)).toEqual(['c1'])
    expect(manifest.reviewLogs.map((l) => l.id)).toEqual(['l1'])
    expect(manifest.audio).toHaveLength(1)
    expect(await zip.file('audio/r1.webm')!.async('string')).toBe('gravacao do usuario')
  })

  it('identifica o formato e a versão do arquivo no manifesto', async () => {
    const file = await createBackup({ includeNarrations: false })
    const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()))
    const raw = JSON.parse(await zip.file(MANIFEST_PATH)!.async('string')) as Record<string, unknown>

    expect(raw.format).toBe(BACKUP_FORMAT)
    expect(raw.version).toBe(BACKUP_VERSION)
  })

  it('exclui as narrações do arquivo quando a opção está desmarcada', async () => {
    await db.audioBlobs.bulkAdd([makeBlob(), makeRecording()])

    const { zip, manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.includesNarrations).toBe(false)
    expect(manifest.audio.map((a) => a.kind)).toEqual(['user_recording'])
    expect(zip.file('audio/a1.mp3')).toBeNull()
  })

  it('inclui as narrações quando a opção está marcada', async () => {
    await db.audioBlobs.bulkAdd([makeBlob(), makeRecording()])

    const { zip, manifest } = await readZip(await createBackup({ includeNarrations: true }))

    expect(manifest.includesNarrations).toBe(true)
    expect(manifest.audio.map((a) => a.id).sort()).toEqual(['a1', 'r1'])
    expect(await zip.file('audio/a1.mp3')!.async('string')).toBe('narracao')
  })

  it('registra na narração a voz e a frase do cartão no momento da geração', async () => {
    await db.audioBlobs.add(makeBlob())

    const { manifest } = await readZip(await createBackup({ includeNarrations: true }))

    expect(manifest.audio[0]).toMatchObject({
      cardId: 'c1',
      voice: 'nova',
      sentence: 'I gave up',
      mimeType: 'audio/mpeg',
      path: 'audio/a1.mp3',
    })
  })

  it('não exporta o áudio devagar, que nenhum ponto de escrita gera', async () => {
    await db.audioBlobs.add(makeBlob({ id: 's1', kind: 'tts_slow' }))

    const { manifest } = await readZip(await createBackup({ includeNarrations: true }))

    expect(manifest.audio).toEqual([])
  })

  it('não exporta o áudio sem cartão correspondente', async () => {
    await db.audioBlobs.add(makeRecording({ cardId: 'sumiu' }))

    const { manifest } = await readZip(await createBackup({ includeNarrations: true }))

    expect(manifest.audio).toEqual([])
  })

  it('inclui os registros excluídos, porque é backup e não fila de estudo', async () => {
    await db.cards.add(makeCard({ id: 'c2', deletedAt: 900 }))

    const { manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.cards.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('grava o conteúdo sem estado de sincronização, mesmo com alterações pendentes', async () => {
    await db.cards.update('c1', { sentence: 'I gave up on it' })

    const { manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect((await db.cards.get('c1'))!.dirty).toBe(1)
    expect(manifest.cards[0].dirty).toBe(0)
  })

  it('registra a conta vinculada ao aparelho', async () => {
    await db.syncState.put({ key: 'boundUserId', value: 'user-1' })

    const { manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.accountId).toBe('user-1')
  })

  it('registra ausência de conta quando o aparelho nunca entrou em uma', async () => {
    const { manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.accountId).toBeNull()
  })

  it('carimba o momento da geração', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4242)

    const { manifest } = await readZip(await createBackup({ includeNarrations: false }))

    expect(manifest.exportedAt).toBe(4242)
  })
})


describe('downloadBackup', () => {
  it('dispara o download com o nome no formato lingo-backup-AAAA-MM-DD.zip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-09T10:00:00Z'))
    const { revokeObjectURL, restore } = stubObjectUrl('blob:fake')
    restoreObjectUrl = restore
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadBackup({ includeNarrations: false })

    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('lingo-backup-2026-03-09.zip')
    expect(anchor.href).toBe('blob:fake')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
