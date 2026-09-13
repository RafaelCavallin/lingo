/**
 * Rótulos dos botões de áudio. Ficam aqui, fora do JSX, porque a regra é a
 * mesma nas duas telas: enquanto o som sai, o botão diz o que está
 * acontecendo em vez de repetir o convite para tocar. `loading` é a busca do
 * áudio (rede/cache); `playing` só liga quando o som já está saindo — sem
 * essa distinção o botão dizia "Pausar" durante todo o fetch do TTS.
 */
export type ListenPhase = 'idle' | 'loading' | 'playing'

export const LISTEN_LABEL = '▸ Ouvir'
export const LISTEN_LOADING_LABEL = 'Carregando…'
export const PAUSE_LABEL = '❚❚ Pausar'
export const REPEAT_LABEL = 'Repetir'
export const REPEAT_LOADING_LABEL = 'Carregando…'
export const PLAYING_LABEL = 'Tocando…'

/** Botão único de pré-escuta do cadastro: o mesmo botão toca e pausa. */
export function listenLabel(phase: ListenPhase): string {
  if (phase === 'playing') return PAUSE_LABEL
  if (phase === 'loading') return LISTEN_LOADING_LABEL
  return LISTEN_LABEL
}

/** Botão "Repetir" da revisão: enquanto o som sai ou é buscado, ele só avisa. */
export function repeatLabel(phase: ListenPhase): string {
  if (phase === 'playing') return PLAYING_LABEL
  if (phase === 'loading') return REPEAT_LOADING_LABEL
  return REPEAT_LABEL
}
