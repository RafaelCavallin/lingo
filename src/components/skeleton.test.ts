import { describe, expect, it } from 'vitest'
import { skeletonStyle } from './skeleton'

describe('skeletonStyle', () => {
  it('sempre devolve uma altura definida, mesmo sem input', () => {
    expect(skeletonStyle({}).height).toBe('1em')
  })

  it('usa a forma "block" como padrão', () => {
    expect(skeletonStyle({}).className).toBe('skeleton rounded-md')
  })

  it('usa 100% de largura como padrão', () => {
    expect(skeletonStyle({}).width).toBe('100%')
  })

  it('respeita largura e altura explícitas', () => {
    expect(skeletonStyle({ width: '3ch', height: '2rem' })).toEqual({
      className: 'skeleton rounded-md',
      width: '3ch',
      height: '2rem',
    })
  })

  it('força a largura do círculo a ser igual à altura', () => {
    expect(skeletonStyle({ shape: 'circle', width: '10rem', height: '2rem' }).width).toBe('2rem')
  })

  it('escolhe a classe certa para cada forma', () => {
    expect(skeletonStyle({ shape: 'text' }).className).toBe('skeleton rounded')
    expect(skeletonStyle({ shape: 'pill' }).className).toBe('skeleton rounded-full')
    expect(skeletonStyle({ shape: 'circle' }).className).toBe('skeleton rounded-full')
  })
})
