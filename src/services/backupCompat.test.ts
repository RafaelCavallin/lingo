import { afterEach, describe, expect, it } from 'vitest'
import { APP_VERSION } from './appVersion'
import { BackupFileInvalid, BackupFormatTooOld, BackupVersionTooNew } from './backupErrors'
import { readBackup } from './backupPreview'
import { restoreBackup } from './backupRestore'
import { db } from './db'
import { backupOf, makeCard, makeDeck, makeLog, manifestV3, zipWithManifest } from '../test/backupFixtures'
import { resetDb } from '../test/dbHelpers'

const SOURCE = {
  decks: [makeDeck({ fsrsParams: [0.4, 0.9, 2.3], paramsOptimizedAt: 7000 })],
  cards: [makeCard({ due: 9999, stability: 7.25, difficulty: 4.5, state: 2, lastReview: 4321 })],
  reviewLogs: [makeLog()],
}

async function restoreAll(file: Blob) {
  const preview = await readBackup(file)
  await restoreBackup({ preview, plan: 'merge', includeNarrations: false })
  return preview
}

async function expectDbEqualsSource() {
  expect(await db.decks.toArray()).toEqual(SOURCE.decks.map((deck) => ({ ...deck, dirty: 1 })))
  expect(await db.cards.toArray()).toEqual(SOURCE.cards.map((card) => ({ ...card, dirty: 1 })))
  expect(await db.reviewLogs.toArray()).toEqual(SOURCE.reviewLogs.map((log) => ({ ...log, dirty: 1 })))
}

async function seedLocalCard() {
  await db.cards.add(makeCard({ id: 'local' }))
}

async function expectLocalUntouched() {
  expect(await db.cards.count()).toBe(1)
  expect(await db.decks.count()).toBe(0)
  expect(await db.reviewLogs.count()).toBe(0)
}

afterEach(async () => {
  await resetDb()
})

describe('compatibilidade de versão do backup', () => {
  it('ida e volta da versão atual preserva o agendamento e grava a versão do app', async () => {
    const file = await backupOf(SOURCE)

    const preview = await restoreAll(file)

    expect(preview.formatVersion).toBe(4)
    expect(preview.convertedFrom).toBeNull()
    expect(preview.appVersion).toBe(APP_VERSION)
    await expectDbEqualsSource()
  })

  it('converte e restaura o arquivo da versão anterior montado à mão', async () => {
    const file = await zipWithManifest(manifestV3(SOURCE))

    const preview = await restoreAll(file)

    expect(preview.formatVersion).toBe(3)
    expect(preview.convertedFrom).toBe(3)
    expect(preview.appVersion).toBeNull()
    expect(preview.discarded).toBe(0)
    await expectDbEqualsSource()
  })

  it('recusa o arquivo de versão mais nova sem escrever nada', async () => {
    await seedLocalCard()
    const file = await zipWithManifest({ ...manifestV3(SOURCE), version: 5 })

    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupVersionTooNew)
    await expectLocalUntouched()
  })

  it('recusa o JSON antigo da versão 2 como formato antigo', async () => {
    await seedLocalCard()
    const legacy = { version: 2, exportedAt: 1, decks: SOURCE.decks, cards: SOURCE.cards, reviewLogs: [] }

    await expect(readBackup(new Blob([JSON.stringify(legacy)]))).rejects.toBeInstanceOf(BackupFormatTooOld)
    await expectLocalUntouched()
  })

  it('recusa o ZIP do Lingo de duas versões atrás como formato antigo', async () => {
    const file = await zipWithManifest({ ...manifestV3(SOURCE), version: 2 })

    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupFormatTooOld)
  })

  it.each([
    ['ZIP de outro app', () => zipWithManifest({ format: 'anki', version: 4 })],
    ['arquivo que não é ZIP nem JSON do Lingo', () => Promise.resolve(new Blob(['nada disso']))],
    ['JSON qualquer', () => Promise.resolve(new Blob([JSON.stringify({ ola: 'mundo' })]))],
    ['ZIP com manifesto que não é JSON', () => zipWithManifest('{ isto nao e json')],
  ])('mantém "não é um backup do Lingo" para: %s', async (_nome, makeFile) => {
    await seedLocalCard()

    await expect(readBackup(await makeFile())).rejects.toBeInstanceOf(BackupFileInvalid)
    await expectLocalUntouched()
  })
})
