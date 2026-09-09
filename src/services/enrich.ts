import { z } from 'zod'
import type { Hint } from './db'
import { EnrichUnavailable, postJson } from './apiJson'

export { EnrichUnavailable }

const schema = z.object({
  translation: z.string().min(1),
  // Opcional de propósito: uma resposta sem fonética continua útil.
  phonetic: z.string().max(160).default(''),
  hints: z
    .array(
      z.object({
        type: z.enum(['phrasal_verb', 'false_cognate', 'pronunciation', 'custom']),
        text: z.string().min(1).max(160),
      }),
    )
    .max(3)
    .default([]),
})

export interface Enrichment {
  translation: string
  phonetic: string
  hints: Hint[]
}

/**
 * Pede tradução e dicas para a frase. Uma tentativa de repetição cobre o caso
 * de o modelo devolver JSON malformado; além disso, o cadastro manual assume.
 */
export async function enrich(sentence: string, signal?: AbortSignal): Promise<Enrichment> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await postJson('/api/enrich', { sentence }, { signal, label: 'geração' })
      const parsed = schema.parse(raw)
      return {
        translation: parsed.translation,
        phonetic: parsed.phonetic,
        hints: parsed.hints.map((h) => ({ ...h, source: 'ai' as const })),
      }
    } catch (e) {
      if (e instanceof EnrichUnavailable || (e as Error)?.name === 'AbortError') throw e
      lastError = e
    }
  }
  throw new Error(
    lastError instanceof Error && lastError.message
      ? lastError.message
      : 'Não foi possível gerar a tradução agora.',
  )
}
