import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBackup } from './backupPreview'
import { db } from './db'
import { runRestore } from './restoreRun'
import type { RestoreChoice } from './restoreChoice'
import type { RestoreStage } from './restoreProgressView'
import { backupOf, makeCard, makeDeck } from '../test/backupFixtures'
import { resetDb } from '../test/dbHelpers'

const downloadBackupMock = vi.hoisted(() => vi.fn())

vi.mock('./backupExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backupExport')>()),
  downloadBackup: downloadBackupMock,
}))

const MERGE: RestoreChoice = { plan: 'merge', includeNarrations: false, skipDuplicates: true, safetyCopy: false }

async function previewOfNewCard() {
  const file = await backupOf({ decks: [makeDeck()], cards: [makeCard({ id: 'do-arquivo' })] })
  await db.cards.add(makeCard({ id: 'antigo', sentence: 'Já estava aqui', translation: 'y' }))
  return readBackup(file)
}

afterEach(async () => {
  downloadBackupMock.mockReset()
  await resetDb()
})

describe('runRestore', () => {
  it('baixa a cópia de segurança antes de escrever e devolve o nome do arquivo', async () => {
    const order: string[] = []
    downloadBackupMock.mockImplementation(async () => {
      order.push(`cópia com ${await db.cards.count()} cartão`)
      return 'lingo-antes-de-restaurar-2026-11-11.zip'
    })
    const preview = await previewOfNewCard()

    const outcome = await runRestore({ preview, choice: { ...MERGE, safetyCopy: true }, onStage: () => {} })

    expect(order).toEqual(['cópia com 1 cartão'])
    expect(downloadBackupMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'safety', includeNarrations: false }))
    expect(outcome.safetyFileName).toBe('lingo-antes-de-restaurar-2026-11-11.zip')
    expect(await db.cards.count()).toBe(2)
  })

  it('não escreve nada quando a cópia de segurança falha', async () => {
    downloadBackupMock.mockRejectedValue(new Error('sem espaço para baixar'))
    const preview = await previewOfNewCard()

    await expect(runRestore({ preview, choice: { ...MERGE, safetyCopy: true }, onStage: () => {} })).rejects.toThrow(
      'sem espaço para baixar',
    )

    expect((await db.cards.toArray()).map((card) => card.id)).toEqual(['antigo'])
    expect(await db.decks.count()).toBe(0)
  })

  it('não baixa cópia ao mesclar com a opção desmarcada', async () => {
    const preview = await previewOfNewCard()

    const outcome = await runRestore({ preview, choice: MERGE, onStage: () => {} })

    expect(downloadBackupMock).not.toHaveBeenCalled()
    expect(outcome.safetyFileName).toBeNull()
  })

  it('baixa a cópia ao substituir mesmo com a opção desmarcada', async () => {
    downloadBackupMock.mockResolvedValue('copia.zip')
    const preview = await previewOfNewCard()

    const outcome = await runRestore({ preview, choice: { ...MERGE, plan: 'replace' }, onStage: () => {} })

    expect(outcome.safetyFileName).toBe('copia.zip')
    expect(outcome.report.plan).toBe('replace')
  })

  it('anuncia os passos na ordem: cópia de segurança e depois dados', async () => {
    downloadBackupMock.mockImplementation(({ onProgress }: { onProgress: (percent: number) => void }) => {
      onProgress(50)
      return Promise.resolve('copia.zip')
    })
    const stages: RestoreStage[] = []
    const preview = await previewOfNewCard()

    await runRestore({ preview, choice: { ...MERGE, safetyCopy: true }, onStage: (stage) => stages.push(stage) })

    expect(stages).toEqual([
      { step: 'safety-backup', done: null, total: null },
      { step: 'safety-backup', done: 50, total: 100 },
      { step: 'data', done: 0, total: 2 },
    ])
  })
})
