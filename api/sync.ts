/**
 * Fase 4 — snapshot de sincronização em um par chave/valor.
 *
 * Guarda o estado sob uma frase-chave escolhida pelo usuário, transformada em
 * hash antes de virar chave no armazenamento — a frase original nunca é gravada.
 * Não há contas nem login: quem tem a frase, tem os dados. Suficiente para uso
 * pessoal, e o suficiente é o ponto.
 *
 * Backend: Redis (LINGO_REDIS_URL) via protocolo nativo — por isso roda no
 * runtime Node.js (não edge, que não permite socket TCP). A conexão é aberta
 * e fechada a cada requisição: mantê-la viva em escopo de módulo trava o
 * `vercel dev` local (o processo nunca se considera "ocioso" com o socket
 * aberto). O custo de reconectar a cada sync é imperceptível para uso pessoal.
 */
import Redis from 'ioredis'

const REDIS_URL = process.env.LINGO_REDIS_URL
const MAX_BYTES = 4_000_000

export default async function handler(req: Request): Promise<Response> {
  console.log('[api/sync]', req.method, 'redis configured:', !!REDIS_URL)
  if (!REDIS_URL) return text('Sincronização não configurada no servidor.', 501)

  const key = new URL(req.url, 'http://localhost').searchParams.get('key')?.trim()
  if (!key || key.length < 8) return text('Frase-chave ausente ou curta demais.', 400)

  const slot = `lingo:${await hash(key)}`
  console.log('[api/sync] slot:', slot)

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 })
  redis.on('error', (err) => console.error('[api/sync] redis client error:', err))

  try {
    if (req.method === 'GET') {
      const value = await redis.get(slot)
      console.log('[api/sync] GET bytes:', value?.length ?? 0)
      if (!value) return text('Nada sincronizado ainda.', 404)
      return new Response(value, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    if (req.method === 'PUT') {
      const body = await req.text()
      console.log('[api/sync] PUT bytes:', body.length)
      if (body.length > MAX_BYTES) return text('Snapshot grande demais.', 413)
      await redis.set(slot, body)
      console.log('[api/sync] PUT ok')
      return text('ok', 200)
    }

    return text('Method not allowed', 405)
  } catch (e) {
    console.error('[api/sync] redis error:', e)
    return text('O armazenamento recusou a operação.', 502)
  } finally {
    redis.disconnect()
  }
}

/** A frase-chave só existe no aparelho; o servidor vê apenas o hash. */
async function hash(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
