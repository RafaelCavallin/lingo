import type { RestoreReport } from '../services/backupTypes'

/** Só é "nada foi aplicado" quando nem registros nem áudio mudaram — um
 *  restauro que só trouxe áudio (ex.: mesmo arquivo, narrações agora
 *  incluídas) não pode dizer que não aplicou nada. */
export function nothingApplied(applied: RestoreReport['applied']): boolean {
  return applied.decks + applied.cards + applied.reviewLogs + applied.audio === 0
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

function duplicateNote(duplicates: RestoreReport['duplicates']): string[] {
  if (duplicates.cards === 0) return []
  const { cards, reviewLogs, audio } = duplicates
  if (!duplicates.skipped) {
    return [`${plural(cards, 'cartão repetido foi importado', 'cartões repetidos foram importados')}, como você escolheu.`]
  }
  const left = plural(cards, 'cartão repetido ficou', 'cartões repetidos ficaram')
  return [`${left} de fora, com ${plural(reviewLogs, 'revisão', 'revisões')} e ${plural(audio, 'áudio', 'áudios')} do arquivo.`]
}

function reappearNote(report: RestoreReport): string[] {
  if (report.plan !== 'replace' || !report.boundToAccount) return []
  return ['Abra os outros aparelhos da sua conta e confira o que voltou: o que não tinha sincronizado pode reaparecer.']
}

/** Linhas extras do relatório, na ordem em que o usuário as procura. */
export function reportNotes({
  report,
  safetyFileName,
}: {
  report: RestoreReport
  safetyFileName: string | null
}): string[] {
  const safety = safetyFileName ? [`Cópia de segurança baixada: ${safetyFileName}.`] : []
  return [...duplicateNote(report.duplicates), ...safety, ...reappearNote(report)]
}
