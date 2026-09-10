/**
 * Rótulos dos botões de áudio. Ficam aqui, fora do JSX, porque a regra é a
 * mesma nas duas telas: enquanto o som sai, o botão diz o que está
 * acontecendo em vez de repetir o convite para tocar.
 */
export const LISTEN_LABEL = '▸ Ouvir'
export const PAUSE_LABEL = '❚❚ Pausar'
export const REPEAT_LABEL = 'Repetir'
export const PLAYING_LABEL = 'Tocando…'

/** Botão único de pré-escuta do cadastro: o mesmo botão toca e pausa. */
export function listenLabel(playing: boolean): string {
  return playing ? PAUSE_LABEL : LISTEN_LABEL
}

/** Botão "Repetir" da revisão: enquanto o som sai, ele só avisa. */
export function repeatLabel(playing: boolean): string {
  return playing ? PLAYING_LABEL : REPEAT_LABEL
}
