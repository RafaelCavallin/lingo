/**
 * Cliente HTTP compartilhado pelas rotas de `/api` que dependem de um LLM
 * (enrich, phonetic): mesmos casos de erro, mesma mensagem para quem chama.
 */
export class EnrichUnavailable extends Error {}

/**
 * Faz o POST e devolve o JSON cru — quem chama valida o formato com Zod.
 * `label` entra só na mensagem de erro genérica (ex.: "geração", "busca de pronúncia").
 */
export async function postJson(
  path: string,
  body: unknown,
  { signal, label }: { signal?: AbortSignal; label: string },
): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 501) {
    const detail: unknown = await res.json().catch(() => null)
    throw new EnrichUnavailable(
      detail && typeof detail === 'object' && 'error' in detail
        ? String(detail.error)
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
    const detail: unknown = await res.json().catch(() => null)
    throw new Error(
      detail && typeof detail === 'object' && 'error' in detail
        ? `Falha na ${label}: ${String(detail.error)}`
        : `Falha na ${label} (HTTP ${res.status}).`,
    )
  }

  return res.json()
}
