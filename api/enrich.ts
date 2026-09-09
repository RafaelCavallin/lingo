/**
 * Fase 2 — tradução e dicas geradas a partir da frase em inglês.
 *
 * Papel único: esconder a chave de API e padronizar o prompt.
 * Nada é persistido aqui; o resultado volta para o front, que valida com Zod
 * e abre o formulário preenchido e editável.
 *
 * Provedor trocável por ENRICH_PROVIDER (anthropic | gemini, padrão anthropic) —
 * ver api/_lib/enrichProviders.ts. Trocar de provedor é só trocar essa variável
 * e preencher a chave correspondente no .env.
 */
import { json, respondWithPrompt } from './_lib/enrichHandler'

export const config = { runtime: 'edge' }

const SYSTEM = `Você ajuda um brasileiro a estudar inglês por frases inteiras.

Receba uma frase em inglês e devolva:
1. translation: tradução natural em português do Brasil. Traduza o sentido, não palavra por palavra.
2. phonetic: transcrição fonética em IPA (inglês americano) das palavras da frase cuja
   pronúncia costuma trair quem lê pelo português — normalmente uma ou duas. Se a frase for
   curta, transcreva a frase inteira. Escreva sem barras e sem colchetes, apenas os símbolos
   (ex.: ˈbərd(ə)n). String vazia se nada na frase for digno de nota.
3. hints: de 0 a 3 dicas curtas que ajudem a fixar a frase. Só inclua uma dica se ela for
   realmente útil para esta frase. Nunca invente conteúdo para preencher espaço.

Tipos de dica:
- "phrasal_verb": um phrasal verb ou expressão idiomática presente na frase, com o significado.
- "false_cognate": uma palavra que parece com português mas significa outra coisa.
- "pronunciation": uma pronúncia que surpreende quem lê pelo português.
- "custom": uma observação de gramática ou uso que a frase ilustra bem.

Cada dica tem no máximo 90 caracteres, escrita em português, direta, sem rodeios.

Responda SOMENTE com JSON válido, sem markdown, sem crases, sem texto antes ou depois:
{"translation":"...","phonetic":"...","hints":[{"type":"phrasal_verb","text":"..."}]}`

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let sentence: string | undefined
  try {
    ;({ sentence } = (await req.json()) as { sentence?: string })
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }
  if (!sentence?.trim()) return json({ error: 'Frase vazia.' }, 400)
  if (sentence.length > 500) return json({ error: 'Frase longa demais.' }, 400)

  return respondWithPrompt(SYSTEM, sentence.trim())
}
