import { describe, expect, it } from 'vitest'
import {
  blank,
  markAt,
  marksOf,
  remapMarks,
  remapRanges,
  splitByMarks,
  trimRange,
} from './textMarks'

const SENTENCE = 'He picked up the phone'
//                0123456789...
const PICKED_UP = { start: 3, end: 12 }
const PHONE = { start: 17, end: 22 }

describe('marksOf', () => {
  it('mescla as duas listas ordenadas pelo início', () => {
    expect(marksOf([PHONE], [PICKED_UP])).toEqual([
      { ...PICKED_UP, kind: 'emphasis' },
      { ...PHONE, kind: 'cloze' },
    ])
  })

  it('trata listas ausentes como vazias', () => {
    expect(marksOf()).toEqual([])
  })
})

describe('splitByMarks', () => {
  it('devolve o texto inteiro sem marcas', () => {
    expect(splitByMarks(SENTENCE, [])).toEqual([{ text: SENTENCE, start: 0, kind: null }])
  })

  it('intercala lacuna e destaque na mesma passada', () => {
    const segs = splitByMarks(SENTENCE, marksOf([PHONE], [PICKED_UP]))
    expect(segs).toEqual([
      { text: 'He ', start: 0, kind: null },
      { text: 'picked up', start: 3, kind: 'emphasis' },
      { text: ' the ', start: 12, kind: null },
      { text: 'phone', start: 17, kind: 'cloze' },
    ])
  })

  it('cobre marcas no início, no fim e coladas uma na outra', () => {
    const segs = splitByMarks('abcdef', marksOf([{ start: 0, end: 2 }], [{ start: 2, end: 6 }]))
    expect(segs).toEqual([
      { text: 'ab', start: 0, kind: 'cloze' },
      { text: 'cdef', start: 2, kind: 'emphasis' },
    ])
  })

  it('descarta a segunda marca quando duas se sobrepõem', () => {
    const segs = splitByMarks(SENTENCE, marksOf([PICKED_UP], [{ start: 5, end: 15 }]))
    expect(segs.filter((s) => s.kind !== null)).toEqual([
      { text: 'picked up', start: 3, kind: 'cloze' },
    ])
    expect(segs.map((s) => s.text).join('')).toBe(SENTENCE)
  })

  it('preserva o texto original ao concatenar os segmentos', () => {
    const segs = splitByMarks(SENTENCE, marksOf([PHONE], [PICKED_UP]))
    expect(segs.map((s) => s.text).join('')).toBe(SENTENCE)
  })
})

describe('blank', () => {
  it('usa no mínimo três traços', () => {
    expect(blank('a')).toBe('___')
    expect(blank('picked up')).toBe('_________')
  })
})

describe('remapRanges', () => {
  it('mantém as marcas ao digitar no fim da frase', () => {
    const after = `${SENTENCE} again`

    expect(remapRanges(SENTENCE, after, [PICKED_UP, PHONE])).toEqual([PICKED_UP, PHONE])
  })

  it('empurra as marcas que vêm depois do trecho digitado', () => {
    const after = 'Yesterday he picked up the phone'

    expect(remapRanges(SENTENCE, after, [PICKED_UP, PHONE])).toEqual([
      { start: 13, end: 22 },
      { start: 27, end: 32 },
    ])
  })

  it('descarta só a marca que o trecho apagado atravessa', () => {
    const after = 'He picked the phone'

    expect(remapRanges(SENTENCE, after, [PICKED_UP, PHONE])).toEqual([{ start: 14, end: 19 }])
  })

  it('preserva a marca colada no ponto da edição', () => {
    const after = 'He picked up! the phone'

    expect(remapRanges(SENTENCE, after, [PICKED_UP])).toEqual([PICKED_UP])
  })

  it('descarta tudo quando o texto é trocado por completo', () => {
    expect(remapRanges(SENTENCE, 'She hung up', [PICKED_UP, PHONE])).toEqual([])
  })

  it('devolve a mesma lista quando o texto não mudou', () => {
    expect(remapRanges(SENTENCE, SENTENCE, [PHONE])).toEqual([PHONE])
    expect(remapRanges(SENTENCE, 'He picked', [])).toEqual([])
  })
})

describe('trimRange', () => {
  it('tira os espaços das pontas da seleção', () => {
    expect(trimRange(SENTENCE, { start: 2, end: 13 })).toEqual(PICKED_UP)
  })

  it('mantém a seleção que já começa e termina em letra', () => {
    expect(trimRange(SENTENCE, PHONE)).toEqual(PHONE)
  })

  it('vira uma seleção vazia quando só há espaço', () => {
    expect(trimRange(SENTENCE, { start: 2, end: 3 })).toEqual({ start: 2, end: 2 })
  })
})

describe('markAt', () => {
  const MARKS = marksOf([PHONE], [PICKED_UP])

  it('acha a marca que a seleção atravessa', () => {
    expect(markAt(MARKS, { start: 5, end: 8 })).toEqual({ ...PICKED_UP, kind: 'emphasis' })
  })

  it('acha a marca em que o cursor parou dentro', () => {
    expect(markAt(MARKS, { start: 19, end: 19 })).toEqual({ ...PHONE, kind: 'cloze' })
  })

  it('ignora o cursor parado na borda da marca', () => {
    expect(markAt(MARKS, { start: 17, end: 17 })).toBeNull()
    expect(markAt(MARKS, { start: 22, end: 22 })).toBeNull()
  })

  it('devolve null quando a seleção está livre', () => {
    expect(markAt(MARKS, { start: 12, end: 16 })).toBeNull()
  })
})

describe('remapMarks', () => {
  it('remapeia lacunas e destaques na mesma passada', () => {
    const marks = { cloze: [PHONE], emphasis: [PICKED_UP] }

    expect(remapMarks(SENTENCE, 'Yesterday he picked up the phone', marks)).toEqual({
      cloze: [{ start: 27, end: 32 }],
      emphasis: [{ start: 13, end: 22 }],
    })
  })
})
