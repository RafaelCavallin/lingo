import { useState } from 'react'
import { PronunciationNotFound, fetchPhonetic } from '../services/pronunciation'

function noticeFor(error: unknown): string {
  return error instanceof PronunciationNotFound
    ? error.message
    : 'Não foi possível buscar a pronúncia agora.'
}

/**
 * Busca a fonética de um trecho selecionado na frase (botão "Adicionar
 * transcrição fonética" do CardForm) e entrega o resultado para o campo
 * FONÉTICA, substituindo o que estiver lá.
 */
export function usePhoneticLookup(onFound: (ipa: string) => void) {
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  async function lookup(term: string, sentence: string): Promise<void> {
    setStatus('loading')
    setNotice(null)
    try {
      onFound(await fetchPhonetic(term, sentence))
    } catch (e) {
      setNotice(noticeFor(e))
    } finally {
      setStatus('idle')
    }
  }

  return { status, notice, lookup }
}
