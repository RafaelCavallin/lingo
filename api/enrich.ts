/**
 * Fase 2 — tradução e dicas geradas a partir da frase em inglês.
 *
 * Papel único: esconder a chave de API e padronizar o prompt.
 * Nada é persistido aqui; o resultado volta para o front, que valida com Zod
 * e abre o formulário preenchido e editável.
 */
export const config = { runtime: 'edge' }

// Haiku dá conta de tradução curta e dicas, com a menor latência e custo.
// Troque por claude-sonnet-5 se quiser dicas mais elaboradas.
// `||` e não `??`: a variável vem como string vazia quando o .env a declara
// sem valor, e "" precisa cair no padrão igual a undefined.
const MODEL = process.env.ENRICH_MODEL?.trim() || 'claude-haiku-4-5-20251001'

const SYSTEM = `Você ajuda um brasileiro a estudar inglês por frases inteiras.

Receba uma frase em inglês e devolva:
1. translation: tradução natural em português do Brasil. Traduza o sentido, não palavra por palavra.
2. hints: de 0 a 3 dicas curtas que ajudem a fixar a frase. Só inclua uma dica se ela for
   realmente útil para esta frase. Nunca invente conteúdo para preencher espaço.

Tipos de dica:
- "phrasal_verb": um phrasal verb ou expressão idiomática presente na frase, com o significado.
- "false_cognate": uma palavra que parece com português mas significa outra coisa.
- "pronunciation": uma pronúncia que surpreende quem lê pelo português.
- "custom": uma observação de gramática ou uso que a frase ilustra bem.

Cada dica tem no máximo 90 caracteres, escrita em português, direta, sem rodeios.

Responda SOMENTE com JSON válido, sem markdown, sem crases, sem texto antes ou depois:
{"translation":"...","hints":[{"type":"phrasal_verb","text":"..."}]}`

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json({ error: 'Chave da API não configurada no servidor.' }, 501)

  let sentence: string | undefined
  try {
    ;({ sentence } = (await req.json()) as { sentence?: string })
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }
  if (!sentence?.trim()) return json({ error: 'Frase vazia.' }, 400)
  if (sentence.length > 500) return json({ error: 'Frase longa demais.' }, 400)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: sentence.trim() }],
      }),
    })

    if (!res.ok) {
      // O detalhe da API vai para o log do servidor; o cliente recebe só o status.
      console.error('enrich upstream', res.status, await res.text().catch(() => ''))
      return json({ error: `A API respondeu ${res.status}.`, upstream: res.status }, 502)
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const raw = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()

    // O modelo é instruído a não usar crases, mas a limpeza custa pouco.
    const clean = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()

    return new Response(clean, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return json({ error: 'Não foi possível falar com o serviço de tradução.' }, 502)
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
