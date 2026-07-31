/**
 * Provedores de LLM para /api/enrich, atrás de uma interface comum.
 * Trocar de provedor é só trocar ENRICH_PROVIDER + a chave correspondente no .env.
 */

export interface EnrichProvider {
  envKey: string
  defaultModel: string
  call(args: { apiKey: string; model: string; system: string; sentence: string }): Promise<string>
}

const anthropic: EnrichProvider = {
  envKey: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-haiku-4-5-20251001',
  async call({ apiKey, model, system, sentence }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: sentence }],
      }),
    })

    if (!res.ok) {
      console.error('enrich upstream (anthropic)', res.status, await res.text().catch(() => ''))
      throw new UpstreamError(res.status)
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
  },
}

const gemini: EnrichProvider = {
  envKey: 'GEMINI_API_KEY',
  defaultModel: 'gemini-flash-latest',
  async call({ apiKey, model, system, sentence }) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: sentence }] }],
        }),
      },
    )

    if (!res.ok) {
      console.error('enrich upstream (gemini)', res.status, await res.text().catch(() => ''))
      throw new UpstreamError(res.status)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()
  },
}

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream respondeu ${status}.`)
  }
}

export const PROVIDERS: Record<string, EnrichProvider> = { anthropic, gemini }
