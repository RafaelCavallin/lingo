import { z } from 'zod'
import type { Hint } from './db'

const schema = z.object({
  translation: z.string().min(1),
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
  hints: Hint[]
}

export class EnrichUnavailable extends Error {}

/**
 * Pede tradução e dicas para a frase. Uma tentativa de repetição cobre o caso
 * de o modelo devolver JSON malformado; além disso, o cadastro manual assume.
 */
export async function enrich(sentence: string, signal?: AbortSignal): Promise<Enrichment> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence }),
        signal,
      })

      if (res.status === 501) {
        const detail = await res.json().catch(() => null)
        throw new EnrichUnavailable(
          detail && typeof detail === 'object' && 'error' in detail
            ? String((detail as { error: unknown }).error)
            : 'Geração automática não configurada no servidor.',
        )
      }
      // 404 quase sempre significa que as funções de /api não estão no ar —
      // é o que acontece ao rodar `npm run dev` em vez de `npx vercel dev`.
      if (res.status === 404) {
        throw new EnrichUnavailable(
          'As funções de /api não estão respondendo. Rode com `npx vercel dev` para ativá-las.',
        )
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(
          detail && typeof detail === 'object' && 'error' in detail
            ? `Falha na geração: ${String((detail as { error: unknown }).error)}`
            : `Falha na geração (HTTP ${res.status}).`,
        )
      }

      const parsed = schema.parse(await res.json())
      return {
        translation: parsed.translation,
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
