/**
 * Fonética sob demanda de um trecho selecionado na frase (uma palavra ou uma
 * expressão como um phrasal verb). Diferente de `phonetic` em /api/enrich
 * (que cobre a frase inteira), aqui o pedido é pontual: o usuário seleciona
 * o trecho no formulário e clica em "Adicionar transcrição fonética".
 *
 * A frase completa entra como contexto para o modelo devolver a pronúncia
 * ligada e reduzida do trecho dentro dela, não a de cada palavra isolada —
 * é o que a dictionaryapi.dev (usada antes) não sabia fazer com phrasal verbs.
 */
import { json, respondWithPrompt } from './_lib/enrichHandler'

export const config = { runtime: 'edge' }

const SYSTEM = `Você transcreve pronúncia de inglês (IPA, inglês americano) para um brasileiro
estudando por frases.

Vai receber um trecho (uma palavra ou expressão) e, entre colchetes, a frase onde ele aparece.
Devolva a transcrição fonética IPA de como o trecho soa dentro dessa frase — com ligação entre
palavras e redução, quando for o caso (ex.: "look forward to" dentro de uma frase falada casual
vira algo como ˌlʊk ˈfɔːrwərd tə, não a leitura de cada palavra isolada).

Escreva sem barras e sem colchetes, apenas os símbolos. Se não souber transcrever o trecho com
confiança, devolva string vazia.

Responda SOMENTE com JSON válido, sem markdown, sem crases, sem texto antes ou depois:
{"phonetic":"..."}`

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let term: string | undefined
  let sentence: string | undefined
  try {
    ;({ term, sentence } = (await req.json()) as { term?: string; sentence?: string })
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }
  if (!term?.trim()) return json({ error: 'Trecho vazio.' }, 400)
  if (term.length > 80) return json({ error: 'Trecho longo demais.' }, 400)
  if (sentence && sentence.length > 500) return json({ error: 'Frase longa demais.' }, 400)

  const userText = sentence?.trim() ? `${term.trim()} [${sentence.trim()}]` : term.trim()
  return respondWithPrompt(SYSTEM, userText)
}
