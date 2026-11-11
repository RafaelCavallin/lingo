import { describe, expect, it } from 'vitest'
import type { RestoreReport } from '../services/backupTypes'
import { nothingApplied, reportNotes } from './restoreResult'

function makeReport(overrides: Partial<RestoreReport> = {}): RestoreReport {
  return {
    plan: 'merge',
    boundToAccount: false,
    duplicates: { cards: 0, reviewLogs: 0, audio: 0, skipped: true },
    applied: { decks: 1, cards: 1, reviewLogs: 0, audio: 0 },
    tombstoned: 0,
    skippedStale: 0,
    skippedInvalid: 0,
    audioIncomplete: false,
    ...overrides,
  }
}

describe('nothingApplied', () => {
  it('é verdadeiro quando registros e áudio estão zerados', () => {
    expect(nothingApplied({ decks: 0, cards: 0, reviewLogs: 0, audio: 0 })).toBe(true)
  })

  it('é falso quando só o áudio foi aplicado', () => {
    expect(nothingApplied({ decks: 0, cards: 0, reviewLogs: 0, audio: 3 })).toBe(false)
  })

  it('é falso quando algum registro foi aplicado', () => {
    expect(nothingApplied({ decks: 1, cards: 0, reviewLogs: 0, audio: 0 })).toBe(false)
  })
})

describe('reportNotes', () => {
  it('não acrescenta nada quando não houve duplicata, cópia nem substituição com conta', () => {
    expect(reportNotes({ report: makeReport(), safetyFileName: null })).toEqual([])
  })

  it('conta as duplicatas puladas com as revisões e os áudios que ficaram de fora', () => {
    const report = makeReport({ duplicates: { cards: 2, reviewLogs: 5, audio: 1, skipped: true } })

    expect(reportNotes({ report, safetyFileName: null })).toEqual([
      '2 cartões repetidos ficaram de fora, com 5 revisões e 1 áudio do arquivo.',
    ])
  })

  it('conta as duplicatas importadas quando o usuário escolheu importar', () => {
    const report = makeReport({ duplicates: { cards: 1, reviewLogs: 0, audio: 0, skipped: false } })

    expect(reportNotes({ report, safetyFileName: null })).toEqual([
      '1 cartão repetido foi importado, como você escolheu.',
    ])
  })

  it('usa o singular quando só um cartão repetido ficou de fora', () => {
    const report = makeReport({ duplicates: { cards: 1, reviewLogs: 1, audio: 0, skipped: true } })

    expect(reportNotes({ report, safetyFileName: null })).toEqual([
      '1 cartão repetido ficou de fora, com 1 revisão e 0 áudios do arquivo.',
    ])
  })

  it('informa o nome da cópia de segurança baixada', () => {
    const notes = reportNotes({ report: makeReport(), safetyFileName: 'lingo-antes-de-restaurar-2026-11-11.zip' })

    expect(notes).toEqual(['Cópia de segurança baixada: lingo-antes-de-restaurar-2026-11-11.zip.'])
  })

  it('orienta a conferir os outros aparelhos depois de substituir com conta', () => {
    const report = makeReport({ plan: 'replace', boundToAccount: true })

    const notes = reportNotes({ report, safetyFileName: null })

    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('outros aparelhos')
  })

  it('não orienta sobre outros aparelhos ao substituir sem conta nem ao mesclar com conta', () => {
    expect(reportNotes({ report: makeReport({ plan: 'replace' }), safetyFileName: null })).toEqual([])
    expect(reportNotes({ report: makeReport({ boundToAccount: true }), safetyFileName: null })).toEqual([])
  })

  it('junta duplicatas, cópia e orientação, nessa ordem', () => {
    const report = makeReport({
      plan: 'replace',
      boundToAccount: true,
      duplicates: { cards: 1, reviewLogs: 0, audio: 0, skipped: true },
    })

    const notes = reportNotes({ report, safetyFileName: 'copia.zip' })

    expect(notes.map((note) => note.split(' ')[0])).toEqual(['1', 'Cópia', 'Abra'])
  })
})
