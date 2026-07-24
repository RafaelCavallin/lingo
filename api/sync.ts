/**
 * Fase 4 — snapshot de sincronização em um par chave/valor.
 *
 * Guarda o estado sob uma frase-chave escolhida pelo usuário, transformada em
 * hash antes de virar chave no armazenamento — a frase original nunca é gravada.
 * Não há contas nem login: quem tem a frase, tem os dados. Suficiente para uso
 * pessoal, e o suficiente é o ponto.
 *
 * Backend: qualquer KV com API REST (Upstash Redis, Vercel KV).
 */
export const config = { runtime: 'edge' }

const URL_BASE = process.env.KV_REST_API_URL
const TOKEN = process.env.KV_REST_API_TOKEN
const MAX_BYTES = 4_000_000

export default async function handler(req: Request): Promise<Response> {
  if (!URL_BASE || !TOKEN) return text('Sincronização não configurada no servidor.', 501)

  const key = new URL(req.url).searchParams.get('key')?.trim()
  if (!key || key.length < 8) return text('Frase-chave ausente ou curta demais.', 400)

  const slot = `cadence:${await hash(key)}`

  if (req.method === 'GET') {
    const res = await kv(['GET', slot])
    const value = (await res.json().catch(() => null)) as { result?: string | null } | null
    if (!value?.result) return text('Nada sincronizado ainda.', 404)
    return new Response(value.result, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  if (req.method === 'PUT') {
    const body = await req.text()
    if (body.length > MAX_BYTES) return text('Snapshot grande demais.', 413)
    const res = await kv(['SET', slot, body])
    if (!res.ok) return text('O armazenamento recusou a gravação.', 502)
    return text('ok', 200)
  }

  return text('Method not allowed', 405)
}

function kv(command: string[]): Promise<Response> {
  return fetch(URL_BASE!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
}

/** A frase-chave só existe no aparelho; o servidor vê apenas o hash. */
async function hash(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
