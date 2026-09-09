import { z } from 'zod'
import { postJson } from './apiJson'

const schema = z.object({ phonetic: z.string().max(160).default('') })

export class PronunciationNotFound extends Error {}

/**
 * Busca a transcrição fonética (IPA) de um trecho selecionado na frase, via
 * `/api/phonetic` — o mesmo backend de IA que gera tradução e dicas. A frase
 * entra como contexto para expressões (phrasal verbs) virem com a ligação e
 * redução que têm dentro dela, não a leitura de cada palavra isolada.
 */
export async function fetchPhonetic(term: string, sentence: string): Promise<string> {
  const raw = await postJson(
    '/api/phonetic',
    { term: term.trim(), sentence },
    { label: 'busca de pronúncia' },
  )
  const { phonetic } = schema.parse(raw)
  if (!phonetic) throw new PronunciationNotFound('Não encontramos a pronúncia desse trecho.')
  return phonetic
}
