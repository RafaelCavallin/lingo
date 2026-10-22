import { fsrs, generatorParameters, Rating, State, StrategyMode } from 'ts-fsrs'
import type { FSRS, TLearningStepsStrategy } from 'ts-fsrs'
import type { Deck } from './db'

export const FSRS_VERSION_LABEL = 'FSRS-6'
export const FSRS6_PARAMETER_COUNT = 21
export const LEGACY_PARAMETER_COUNTS: readonly number[] = [17, 19]

const REQUEST_RETENTION = 0.9
const NEW_CARD_AGAIN_MINUTES = 1
const NEW_CARD_GOOD_MINUTES = 10
const FORGOTTEN_AGAIN_MINUTES = 5

/**
 * Reproduz os tempos do ts-fsrs 4 decidindo só pelo estado do cartão, sem o
 * índice de passo: assim o cartão não precisa guardar `learning_steps`.
 */
export const lingoLearningSteps: TLearningStepsStrategy = (_parameters, state) => {
  if (state === State.New) {
    return {
      [Rating.Again]: { scheduled_minutes: NEW_CARD_AGAIN_MINUTES, next_step: 0 },
      [Rating.Good]: { scheduled_minutes: NEW_CARD_GOOD_MINUTES, next_step: 0 },
    }
  }
  return { [Rating.Again]: { scheduled_minutes: FORGOTTEN_AGAIN_MINUTES, next_step: 0 } }
}

export function createScheduler(parameters?: number[]): FSRS {
  const base = { request_retention: REQUEST_RETENTION, enable_fuzz: true }
  const config = parameters?.length ? { ...base, w: parameters } : base
  return fsrs(generatorParameters(config)).useStrategy(StrategyMode.LEARNING_STEPS, lingoLearningSteps)
}

export function isValidOptimizedParameters(parameters: number[]): boolean {
  return parameters.length === FSRS6_PARAMETER_COUNT && parameters.every(Number.isFinite)
}

export type ParametersSource = 'default' | 'optimized' | 'legacy'

export interface DeckParametersInfo {
  fsrsVersion: typeof FSRS_VERSION_LABEL
  source: ParametersSource
  optimizedAt: number | null
}

function sourceOf(parameters: number[]): ParametersSource {
  if (parameters.length === FSRS6_PARAMETER_COUNT) return 'optimized'
  return LEGACY_PARAMETER_COUNTS.includes(parameters.length) ? 'legacy' : 'default'
}

export function describeParameters(deck: Pick<Deck, 'fsrsParams' | 'paramsOptimizedAt'>): DeckParametersInfo {
  const source = sourceOf(deck.fsrsParams ?? [])
  const optimizedAt = source === 'default' ? null : (deck.paramsOptimizedAt ?? null)
  return { fsrsVersion: FSRS_VERSION_LABEL, source, optimizedAt }
}
