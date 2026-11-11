import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, PREVIOUS_BACKUP_VERSION } from './backupFormat'
import { classifyManifest, isLegacyJsonBackup, upgradeFromPrevious } from './backupVersion'

function manifestOf(version: unknown, extra: Record<string, unknown> = {}) {
  return { format: BACKUP_FORMAT, version, decks: [], cards: [], ...extra }
}

describe('classifyManifest', () => {
  it('classifica como mais nova a versão acima da atual', () => {
    const result = classifyManifest(manifestOf(BACKUP_VERSION + 1))

    expect(result).toEqual({ kind: 'too-new', version: BACKUP_VERSION + 1 })
  })

  it('classifica a versão atual como atual', () => {
    const raw = manifestOf(BACKUP_VERSION)

    expect(classifyManifest(raw)).toEqual({ kind: 'current', raw })
  })

  it('classifica a versão imediatamente anterior para conversão', () => {
    const raw = manifestOf(PREVIOUS_BACKUP_VERSION)

    expect(classifyManifest(raw)).toEqual({ kind: 'previous', raw, from: PREVIOUS_BACKUP_VERSION })
  })

  it('classifica como antiga a versão duas abaixo da atual', () => {
    const result = classifyManifest(manifestOf(BACKUP_VERSION - 2))

    expect(result).toEqual({ kind: 'too-old', version: BACKUP_VERSION - 2 })
  })

  it.each([
    ['nulo', null],
    ['texto', 'backup'],
    ['lista', []],
    ['objeto sem format', { version: BACKUP_VERSION }],
    ['format de outro app', { format: 'anki-backup', version: BACKUP_VERSION }],
    ['versão não inteira', manifestOf(3.5)],
    ['versão em texto', manifestOf('4')],
    ['versão zero', manifestOf(0)],
  ])('classifica como estranho o que não tem o formato do Lingo: %s', (_nome, raw) => {
    expect(classifyManifest(raw)).toEqual({ kind: 'foreign' })
  })
})

describe('isLegacyJsonBackup', () => {
  it.each([[1], [2]])('reconhece o JSON antigo da versão %s', (version) => {
    expect(isLegacyJsonBackup({ version, exportedAt: 1, decks: [], cards: [], reviewLogs: [] })).toBe(true)
  })

  it('não reconhece quando há format, mesmo com versão antiga', () => {
    expect(isLegacyJsonBackup(manifestOf(2))).toBe(false)
  })

  it('não reconhece a versão 3 sem format', () => {
    expect(isLegacyJsonBackup({ version: 3, decks: [], cards: [] })).toBe(false)
  })

  it('não reconhece o que não tem baralhos e cartões em lista', () => {
    expect(isLegacyJsonBackup({ version: 2, decks: {}, cards: [] })).toBe(false)
    expect(isLegacyJsonBackup(null)).toBe(false)
  })
})

describe('upgradeFromPrevious', () => {
  it('converte para a versão atual sem tocar nos registros', () => {
    const decks = [{ id: 'd1' }]
    const cards = [{ id: 'c1' }]
    const raw = manifestOf(PREVIOUS_BACKUP_VERSION, { decks, cards, reviewLogs: [], audio: [] })

    const upgraded = upgradeFromPrevious(raw)

    expect(upgraded).toEqual({ ...raw, version: BACKUP_VERSION, appVersion: null })
  })

  it('devolve intacto o que não é um objeto', () => {
    expect(upgradeFromPrevious('x')).toBe('x')
  })
})
