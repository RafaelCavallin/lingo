import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupFileName, downloadBackup } from './backupExport'
import { readBackup } from './backupPreview'
import { restoreBackup } from './backupRestore'
import { DEFAULT_DECK_NAME, db } from './db'
import { backupOf, makeCard, makeDeck, makeLog } from '../test/backupFixtures'
import { resetDb } from '../test/dbHelpers'

const LOCAL_EVENING = new Date(2026, 10, 11, 23, 0, 0)

let restoreUrl: (() => void) | null = null

function captureDownloads() {
  const blobs: Blob[] = []
  const created = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revoked = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob)
      return 'blob:capturado'
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  restoreUrl = () => {
    if (created) Object.defineProperty(URL, 'createObjectURL', created)
    if (revoked) Object.defineProperty(URL, 'revokeObjectURL', revoked)
  }
  return { blobs, click }
}

afterEach(async () => {
  restoreUrl?.()
  restoreUrl = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetDb()
})

describe('backupFileName', () => {
  it('nomeia a cópia de segurança de forma distinta do backup manual, com a data local', () => {
    const safety = backupFileName({ kind: 'safety', now: LOCAL_EVENING })
    const manual = backupFileName({ kind: 'manual', now: LOCAL_EVENING })

    expect(safety).toBe('lingo-antes-de-restaurar-2026-11-11.zip')
    expect(manual).toBe('lingo-backup-2026-11-11.zip')
  })

  it('completa mês e dia com zero à esquerda', () => {
    const name = backupFileName({ kind: 'manual', now: new Date(2026, 0, 5, 12, 0, 0) })

    expect(name).toBe('lingo-backup-2026-01-05.zip')
  })
})

describe('hasLocalData na prévia', () => {
  async function previewWithLocal(seed: () => Promise<void>) {
    const file = await backupOf({ decks: [makeDeck({ id: 'do-arquivo' })], cards: [makeCard({ id: 'do-arquivo', deckId: 'do-arquivo' })] })
    await seed()
    return readBackup(file)
  }

  it('é falso com o banco vazio', async () => {
    const preview = await previewWithLocal(async () => {})

    expect(preview.hasLocalData).toBe(false)
  })

  it('é falso com só o baralho padrão intocado', async () => {
    const preview = await previewWithLocal(async () => {
      await db.decks.add(makeDeck({ id: 'semeado', name: DEFAULT_DECK_NAME }))
    })

    expect(preview.hasLocalData).toBe(false)
  })

  it('é verdadeiro com um cartão vivo', async () => {
    const preview = await previewWithLocal(async () => {
      await db.decks.add(makeDeck())
      await db.cards.add(makeCard())
    })

    expect(preview.hasLocalData).toBe(true)
  })

  it('é verdadeiro com um baralho vivo que o usuário criou, mesmo sem cartões', async () => {
    const preview = await previewWithLocal(async () => {
      await db.decks.add(makeDeck({ name: 'Trabalho' }))
    })

    expect(preview.hasLocalData).toBe(true)
  })

  it('é verdadeiro só com revisões no histórico', async () => {
    const preview = await previewWithLocal(async () => {
      await db.reviewLogs.add(makeLog())
    })

    expect(preview.hasLocalData).toBe(true)
  })

  it('é falso quando tudo o que existe está excluído e sem revisões', async () => {
    const preview = await previewWithLocal(async () => {
      await db.decks.add(makeDeck({ deletedAt: 900 }))
      await db.cards.add(makeCard({ deletedAt: 900 }))
    })

    expect(preview.hasLocalData).toBe(false)
  })
})

describe('boundToAccount', () => {
  it('reflete o vínculo local de conta, sem precisar de sessão nem de rede', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })
    await db.syncState.put({ key: 'boundUserId', value: 'user-1' })

    const preview = await readBackup(file)
    const report = await restoreBackup({ preview, plan: 'merge', includeNarrations: false })

    expect(preview.boundToAccount).toBe(true)
    expect(report.boundToAccount).toBe(true)
  })

  it('é falso quando o aparelho nunca entrou em uma conta', async () => {
    const file = await backupOf({ decks: [makeDeck()], cards: [makeCard()] })

    const preview = await readBackup(file)
    const report = await restoreBackup({ preview, plan: 'replace', includeNarrations: false })

    expect(preview.boundToAccount).toBe(false)
    expect(report.boundToAccount).toBe(false)
    expect(report.plan).toBe('replace')
  })
})

describe('downloadBackup com cópia de segurança', () => {
  it('gera um ZIP restaurável e devolve o nome, e restaurá-lo desfaz a mesclagem', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(LOCAL_EVENING)
    const fileToMerge = await backupOf({ decks: [makeDeck()], cards: [makeCard({ id: 'do-arquivo', sentence: 'Vem do arquivo', translation: 'x' })] })
    await db.decks.add(makeDeck())
    await db.cards.add(makeCard({ id: 'antigo', sentence: 'Já estava aqui', translation: 'y' }))
    const { blobs, click } = captureDownloads()

    const name = await downloadBackup({ includeNarrations: false, kind: 'safety' })
    await restoreBackup({ preview: await readBackup(fileToMerge), plan: 'merge', includeNarrations: false })
    await restoreBackup({ preview: await readBackup(blobs[0]), plan: 'replace', includeNarrations: false })

    const alive = await db.cards.filter((card) => card.deletedAt === 0).toArray()
    expect(name).toBe('lingo-antes-de-restaurar-2026-11-11.zip')
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(name)
    expect(alive.map((card) => card.id)).toEqual(['antigo'])
  })

  it('mantém o nome do backup manual quando não se indica o tipo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(LOCAL_EVENING)
    captureDownloads()

    const name = await downloadBackup({ includeNarrations: false })

    expect(name).toBe('lingo-backup-2026-11-11.zip')
  })
})
