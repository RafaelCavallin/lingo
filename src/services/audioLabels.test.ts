import { describe, expect, it } from 'vitest'
import { LISTEN_LABEL, PAUSE_LABEL, PLAYING_LABEL, REPEAT_LABEL, listenLabel, repeatLabel } from './audioLabels'

describe('listenLabel', () => {
  it('convida a ouvir quando nada está tocando', () => {
    expect(listenLabel(false)).toBe(LISTEN_LABEL)
  })
  it('vira pausa enquanto o áudio toca', () => {
    expect(listenLabel(true)).toBe(PAUSE_LABEL)
  })
})

describe('repeatLabel', () => {
  it('oferece repetir quando nada está tocando', () => {
    expect(repeatLabel(false)).toBe(REPEAT_LABEL)
  })
  it('avisa que o áudio está tocando', () => {
    expect(repeatLabel(true)).toBe(PLAYING_LABEL)
  })
})
