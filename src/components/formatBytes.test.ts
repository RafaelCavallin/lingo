import { describe, expect, it } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('mostra em bytes abaixo de 1024', () => {
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('vira KB a partir de exatamente 1024', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('ainda mostra em KB um byte antes de 1 MB', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB')
  })

  it('vira MB com uma casa decimal a partir de exatamente 1024²', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('arredonda o KB para o inteiro mais próximo', () => {
    expect(formatBytes(1536)).toBe('2 KB')
  })

  it('mantém uma casa decimal em MB grandes', () => {
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })
})
