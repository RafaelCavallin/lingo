import { describe, expect, it } from 'vitest'
import {
  LISTEN_LABEL,
  LISTEN_LOADING_LABEL,
  PAUSE_LABEL,
  PLAYING_LABEL,
  REPEAT_LABEL,
  REPEAT_LOADING_LABEL,
  listenLabel,
  repeatLabel,
} from './audioLabels'

describe('listenLabel', () => {
  it('convida a ouvir quando nada está tocando', () => {
    expect(listenLabel('idle')).toBe(LISTEN_LABEL)
  })
  it('avisa que está buscando o áudio, sem dizer "Pausar" antes da hora', () => {
    expect(listenLabel('loading')).toBe(LISTEN_LOADING_LABEL)
  })
  it('vira pausa só quando o áudio já está tocando', () => {
    expect(listenLabel('playing')).toBe(PAUSE_LABEL)
  })
})

describe('repeatLabel', () => {
  it('oferece repetir quando nada está tocando', () => {
    expect(repeatLabel('idle')).toBe(REPEAT_LABEL)
  })
  it('avisa que está buscando o áudio', () => {
    expect(repeatLabel('loading')).toBe(REPEAT_LOADING_LABEL)
  })
  it('avisa que o áudio está tocando', () => {
    expect(repeatLabel('playing')).toBe(PLAYING_LABEL)
  })
})
