import type { RestoreReport } from '../services/backupRestore'

/** Só é "nada foi aplicado" quando nem registros nem áudio mudaram — um
 *  restauro que só trouxe áudio (ex.: mesmo arquivo, narrações agora
 *  incluídas) não pode dizer que não aplicou nada. */
export function nothingApplied(applied: RestoreReport['applied']): boolean {
  return applied.decks + applied.cards + applied.reviewLogs + applied.audio === 0
}
