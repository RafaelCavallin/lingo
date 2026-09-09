/**
 * Boilerplate comum às rotas que chamam um provedor de LLM (enrich, phonetic):
 * seleção do provedor, checagem de chave, tratamento de erro e limpeza do
 * JSON de resposta. Cada rota só define o `system` e o texto do usuário.
 */
import { PROVIDERS, UpstreamError } from './enrichProviders'

const PROVIDER_NAME = process.env.ENRICH_PROVIDER?.trim() || 'anthropic'
const PROVIDER = PROVIDERS[PROVIDER_NAME]

const MODEL = process.env.ENRICH_MODEL?.trim() || PROVIDER?.defaultModel

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Chama o provedor ativo com `system` + `userText` e devolve o JSON limpo já
 * como `Response` — ou a `Response` de erro apropriada (501 sem chave/provedor
 * inválido, 502 se o provedor falhar).
 */
export async function respondWithPrompt(system: string, userText: string): Promise<Response> {
  if (!PROVIDER) return json({ error: `ENRICH_PROVIDER inválido: "${PROVIDER_NAME}".` }, 501)

  const key = process.env[PROVIDER.envKey]
  if (!key) return json({ error: `Chave da API não configurada no servidor: falta ${PROVIDER.envKey}.` }, 501)

  try {
    const raw = await PROVIDER.call({ apiKey: key, model: MODEL!, system, sentence: userText })
    const clean = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    return new Response(clean, { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    if (e instanceof UpstreamError) {
      return json({ error: `A API respondeu ${e.status}.`, upstream: e.status }, 502)
    }
    return json({ error: 'Não foi possível falar com o serviço de tradução.' }, 502)
  }
}
