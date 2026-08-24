import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnrichUnavailable, enrich } from './enrich'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn()
  for (const r of responses) {
    if (r instanceof Error) fetchMock.mockRejectedValueOnce(r)
    else fetchMock.mockResolvedValueOnce(r)
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enrich', () => {
  it('devolve tradução, fonética e dicas marcadas como geradas por IA', async () => {
    mockFetch(
      jsonResponse({
        translation: 'Eu desisti',
        phonetic: 'aɪ ɡeɪv ʌp',
        hints: [{ type: 'phrasal_verb', text: 'give up = desistir' }],
      }),
    )

    const result = await enrich('I gave up')

    expect(result).toEqual({
      translation: 'Eu desisti',
      phonetic: 'aɪ ɡeɪv ʌp',
      hints: [{ type: 'phrasal_verb', text: 'give up = desistir', source: 'ai' }],
    })
  })

  it('envia a frase para /api/enrich', async () => {
    const fetchMock = mockFetch(jsonResponse({ translation: 'Eu desisti' }))

    await enrich('I gave up')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/enrich')
    expect(JSON.parse(init.body as string)).toEqual({ sentence: 'I gave up' })
  })

  it('aceita resposta sem fonética e sem dicas', async () => {
    mockFetch(jsonResponse({ translation: 'Eu desisti' }))

    const result = await enrich('I gave up')

    expect(result.phonetic).toBe('')
    expect(result.hints).toEqual([])
  })

  it('propaga o motivo do servidor quando a geração não está configurada (501)', async () => {
    mockFetch(jsonResponse({ error: 'ANTHROPIC_API_KEY ausente' }, 501))

    const error = await enrich('I gave up').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnrichUnavailable)
    expect((error as Error).message).toBe('ANTHROPIC_API_KEY ausente')
  })

  it('usa mensagem padrão quando o 501 vem sem corpo legível', async () => {
    const fetchMock = mockFetch(new Response('nope', { status: 501 }))

    await expect(enrich('I gave up')).rejects.toThrow('Geração automática não configurada no servidor.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('explica que /api não está no ar quando a rota devolve 404', async () => {
    mockFetch(new Response('', { status: 404 }))

    await expect(enrich('I gave up')).rejects.toThrow(/npx vercel dev/)
  })

  it('não tenta de novo quando a falha é definitiva (501)', async () => {
    const fetchMock = mockFetch(jsonResponse({ error: 'sem chave' }, 501))

    await expect(enrich('I gave up')).rejects.toBeInstanceOf(EnrichUnavailable)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tenta uma segunda vez quando a primeira resposta é inválida', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ translation: '' }),
      jsonResponse({ translation: 'Eu desisti' }),
    )

    const result = await enrich('I gave up')

    expect(result.translation).toBe('Eu desisti')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('desiste depois de duas tentativas e devolve o erro do servidor', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: 'upstream caiu' }, 500),
      jsonResponse({ error: 'upstream caiu' }, 500),
    )

    await expect(enrich('I gave up')).rejects.toThrow('Falha na geração: upstream caiu')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('relata o status quando o erro vem sem corpo legível', async () => {
    mockFetch(new Response('boom', { status: 500 }), new Response('boom', { status: 500 }))

    await expect(enrich('I gave up')).rejects.toThrow('Falha na geração (HTTP 500).')
  })

  it('propaga o cancelamento sem repetir a chamada', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' })
    const fetchMock = mockFetch(abort)

    await expect(enrich('I gave up')).rejects.toThrow('cancelado')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('devolve mensagem genérica quando a rede falha sem mensagem', async () => {
    mockFetch(new Error(''), new Error(''))

    await expect(enrich('I gave up')).rejects.toThrow('Não foi possível gerar a tradução agora.')
  })
})
