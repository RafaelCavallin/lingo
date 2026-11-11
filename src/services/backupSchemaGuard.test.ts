import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION } from './backupFormat'
import { cardFields, deckFields, reviewLogFields } from './backupSchema'
import { HINT_TYPES } from './db'

/**
 * Quem mexe nos campos ou nas listas fechadas do arquivo precisa decidir sobre
 * a versão do formato: um app que ainda não conhece o valor novo descarta o
 * registro em silêncio. Atualize este retrato junto com `BACKUP_VERSION` e com
 * a conversão a partir da versão anterior (ver "Backup e restauração" em
 * ARQUITETURA.md).
 */
const SHAPE_OF_VERSION_4 = {
  version: 4,
  deck: [
    'createdAt', 'deletedAt', 'fsrsParams', 'id', 'listenFirst', 'name', 'newCardsPerDay',
    'paramsOptimizedAt', 'speechRate', 'updatedAt', 'voice', 'youngLimit',
  ],
  card: [
    'clozeRanges', 'createdAt', 'deckId', 'deletedAt', 'difficulty', 'due', 'elapsedDays', 'emphasisRanges',
    'hints', 'id', 'lapses', 'lastReview', 'phonetic', 'reps', 'scheduledDays', 'sentence', 'stability',
    'state', 'translation', 'translationEmphasisRanges', 'updatedAt',
  ],
  reviewLog: ['cardId', 'deckId', 'durationMs', 'id', 'rating', 'reviewedAt', 'scheduledDays', 'stateBefore'],
  hintTypes: ['phrasal_verb', 'idiom', 'false_cognate', 'pronunciation', 'custom'],
  ratings: ['again', 'good'],
}

describe('contrato do arquivo de backup', () => {
  it('prende os campos e as listas fechadas à versão do formato', () => {
    const current = {
      version: BACKUP_VERSION,
      deck: Object.keys(deckFields.shape).sort(),
      card: Object.keys(cardFields.shape).sort(),
      reviewLog: Object.keys(reviewLogFields.shape).sort(),
      hintTypes: [...HINT_TYPES],
      ratings: [...reviewLogFields.shape.rating.options],
    }

    expect(current).toEqual(SHAPE_OF_VERSION_4)
  })
})
