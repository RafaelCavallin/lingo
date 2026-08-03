/**
 * Fase 2 — narração em voz neural com sotaque americano.
 * Devolve MP3 puro; o front guarda o blob em IndexedDB e nunca refaz a chamada.
 */
export const config = { runtime: 'edge' }

// `||` e não `??`: variável declarada sem valor no .env chega como "".
const VOICE = process.env.TTS_VOICE?.trim() || 'nova'
const MODEL = process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return text('Method not allowed', 405)

  const key = process.env.OPENAI_API_KEY
  if (!key) return text('TTS não configurado no servidor.', 501)

  let body: { text?: string; voice?: string }
  try {
    body = (await req.json()) as { text?: string; voice?: string }
  } catch {
    return text('Corpo inválido.', 400)
  }
  if (!body.text?.trim()) return text('Frase vazia.', 400)
  if (body.text.length > 500) return text('Frase longa demais.', 400)

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        voice: allowed(body.voice) ?? VOICE,
        input: body.text.trim(),
        response_format: 'mp3',
      }),
      // A revisão não pode travar esperando a nuvem: passou disso, o front usa
      // a voz do navegador.
      signal: AbortSignal.timeout(8_000),
    })

    // Chave inválida, sem crédito ou sem acesso ao modelo não são falhas
    // passageiras — devolvemos 501 para o front desligar a nuvem de uma vez,
    // em vez de pagar o round-trip de novo em cada cartão.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return text('Voz neural indisponível para esta chave.', 501)
    }
    if (res.status === 429 && (await isQuotaExhausted(res))) {
      return text('Sem créditos na conta de voz neural.', 501)
    }
    if (!res.ok) return text('O serviço de áudio recusou a requisição.', 502)

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return text('Não foi possível falar com o serviço de áudio.', 502)
  }
}

/**
 * A OpenAI usa 429 tanto para "muitas requisições agora" (passageiro) quanto
 * para "acabaram os créditos" (não passa sozinho). Só o segundo justifica
 * desligar a nuvem.
 */
async function isQuotaExhausted(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: { type?: string; code?: string } }
    return (
      body.error?.type === 'insufficient_quota' ||
      body.error?.code === 'credit_balance_exhausted'
    )
  } catch {
    return false
  }
}

const VOICES = ['nova', 'alloy', 'shimmer', 'onyx', 'echo', 'fable']
const allowed = (v?: string) => (v && VOICES.includes(v) ? v : undefined)

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
