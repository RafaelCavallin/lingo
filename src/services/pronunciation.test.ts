import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnrichUnavailable } from './apiJson'
import { PronunciationNotFound, fetchPhonetic } from './pronunciation'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn()
  if (response instanceof Error) fetchMock.mockRejectedValueOnce(response)
  else fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPhonetic', () => {
  it('devolve o IPA da resposta', async () => {
    mockFetch(jsonResponse({ phonetic: 'ˌlʊk ˈfɔːrwərd tə' }))

    const result = await fetchPhonetic('look forward to', "I'm looking forward to seeing you.")

    expect(result).toBe('ˌlʊk ˈfɔːrwərd tə')
  })

  it('envia o trecho e a frase de contexto para /api/phonetic', async () => {
    const fetchMock = mockFetch(jsonResponse({ phonetic: 'ɡɪv' }))

    await fetchPhonetic('give', 'I gave up')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/phonetic')
    expect(JSON.parse(init.body as string)).toEqual({ term: 'give', sentence: 'I gave up' })
  })

  it('lança PronunciationNotFound quando o modelo devolve fonética vazia', async () => {
    mockFetch(jsonResponse({ phonetic: '' }))

    await expect(fetchPhonetic('xyzzy', 'xyzzy there')).rejects.toBeInstanceOf(PronunciationNotFound)
  })

  it('lança EnrichUnavailable quando /api não está no ar (404)', async () => {
    mockFetch(new Response('', { status: 404 }))

    await expect(fetchPhonetic('give', 'I gave up')).rejects.toBeInstanceOf(EnrichUnavailable)
  })

  it('lança EnrichUnavailable quando a geração não está configurada (501)', async () => {
    mockFetch(jsonResponse({ error: 'ANTHROPIC_API_KEY ausente' }, 501))

    const error = await fetchPhonetic('give', 'I gave up').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnrichUnavailable)
    expect((error as Error).message).toBe('ANTHROPIC_API_KEY ausente')
  })

  it('propaga erro de rede sem mascarar como "não encontrado"', async () => {
    mockFetch(new Error('offline'))

    const error = await fetchPhonetic('give', 'I gave up').catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(PronunciationNotFound)
    expect(error).toBeInstanceOf(Error)
  })
})
