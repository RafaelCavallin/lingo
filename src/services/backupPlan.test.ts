import { describe, expect, it } from 'vitest'
import type { AudioEntry } from './backupFormat'
import { selectApplicableAudio, selectOrphans, selectWinners, type CardAudioState } from './backupPlan'

const row = (id: string, updatedAt: number) => ({ id, updatedAt })

describe('selectWinners', () => {
  it('aceita o registro do arquivo quando não existe nada local', () => {
    const winners = selectWinners({ incoming: [row('c1', 500)], local: [undefined] })

    expect(winners.map((w) => w.id)).toEqual(['c1'])
  })

  it('descarta o registro do arquivo mais antigo que o local', () => {
    const winners = selectWinners({ incoming: [row('c1', 500)], local: [row('c1', 900)] })

    expect(winners).toEqual([])
  })

  it('respeita a posição de cada registro ao comparar com o local', () => {
    const incoming = [row('c1', 900), row('c2', 100), row('c3', 700)]
    const local = [row('c1', 500), row('c2', 800), undefined]

    const winners = selectWinners({ incoming, local })

    expect(winners.map((w) => w.id)).toEqual(['c1', 'c3'])
  })
})

describe('selectOrphans', () => {
  it('elege como órfãos apenas os locais ausentes do arquivo', () => {
    const orphans = selectOrphans({ localIds: ['c1', 'c2', 'c3'], incomingIds: ['c2'] })

    expect(orphans).toEqual(['c1', 'c3'])
  })

  it('não elege órfão nenhum quando o arquivo contém todos os locais', () => {
    const orphans = selectOrphans({ localIds: ['c1', 'c2'], incomingIds: ['c1', 'c2', 'c9'] })

    expect(orphans).toEqual([])
  })

  it('não elege órfão nenhum quando o aparelho está vazio', () => {
    const orphans = selectOrphans({ localIds: [], incomingIds: ['c1'] })

    expect(orphans).toEqual([])
  })
})

function entry(overrides: Partial<AudioEntry> = {}): AudioEntry {
  return {
    id: 'a1',
    cardId: 'c1',
    kind: 'tts',
    voice: 'nova',
    createdAt: 1000,
    mimeType: 'audio/mpeg',
    bytes: 128,
    sentence: 'I gave up',
    path: 'audio/a1.mp3',
    ...overrides,
  }
}

const cards = (state: Partial<CardAudioState> = {}) =>
  new Map([['c1', { sentence: 'I gave up', deletedAt: 0, ...state }]])

describe('selectApplicableAudio', () => {
  it('aplica a narração cuja frase continua igual à do cartão', () => {
    const decision = selectApplicableAudio({ entries: [entry()], cards: cards(), includeNarrations: true })

    expect(decision.applicable.map((e) => e.id)).toEqual(['a1'])
    expect(decision.stale).toBe(0)
  })

  it('descarta narração cuja frase difere da frase atual do cartão', () => {
    const decision = selectApplicableAudio({
      entries: [entry()],
      cards: cards({ sentence: 'I gave up on it' }),
      includeNarrations: true,
    })

    expect(decision.applicable).toEqual([])
    expect(decision.stale).toBe(1)
  })

  it('mantém gravação do usuário mesmo com a frase alterada', () => {
    const decision = selectApplicableAudio({
      entries: [entry({ id: 'r1', kind: 'user_recording', voice: null })],
      cards: cards({ sentence: 'outra frase' }),
      includeNarrations: true,
    })

    expect(decision.applicable.map((e) => e.id)).toEqual(['r1'])
    expect(decision.stale).toBe(0)
  })

  it('descarta áudio de cartão inexistente', () => {
    const decision = selectApplicableAudio({
      entries: [entry({ cardId: 'sumiu' })],
      cards: cards(),
      includeNarrations: true,
    })

    expect(decision.applicable).toEqual([])
    expect(decision.stale).toBe(1)
  })

  it('descarta áudio de cartão excluído', () => {
    const decision = selectApplicableAudio({
      entries: [entry({ id: 'r1', kind: 'user_recording' })],
      cards: cards({ deletedAt: 900 }),
      includeNarrations: true,
    })

    expect(decision.applicable).toEqual([])
    expect(decision.stale).toBe(1)
  })

  it('ignora narrações quando o usuário opta por não restaurá-las', () => {
    const decision = selectApplicableAudio({
      entries: [entry(), entry({ id: 'r1', kind: 'user_recording' })],
      cards: cards(),
      includeNarrations: false,
    })

    expect(decision.applicable.map((e) => e.id)).toEqual(['r1'])
    expect(decision.stale).toBe(0)
  })
})
