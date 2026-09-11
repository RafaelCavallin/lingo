import { describe, expect, it } from 'vitest'
import { audioFileName, BackupEmpty, BackupFileInvalid } from './backupFormat'

describe('audioFileName', () => {
  it('monta o nome do arquivo de áudio a partir do tipo MIME', () => {
    expect(audioFileName('a1', 'audio/mpeg')).toBe('audio/a1.mp3')
    expect(audioFileName('a2', 'audio/webm')).toBe('audio/a2.webm')
    expect(audioFileName('a3', 'audio/mp4')).toBe('audio/a3.m4a')
    expect(audioFileName('a4', 'audio/ogg')).toBe('audio/a4.ogg')
  })

  it('ignora os parâmetros do tipo MIME gravado pelo MediaRecorder', () => {
    expect(audioFileName('a1', 'audio/webm;codecs=opus')).toBe('audio/a1.webm')
  })

  it('usa a extensão genérica quando o tipo é desconhecido ou vazio', () => {
    expect(audioFileName('a1', 'application/octet-stream')).toBe('audio/a1.bin')
    expect(audioFileName('a2', '')).toBe('audio/a2.bin')
  })
})

describe('erros de backup', () => {
  it('descreve em português o arquivo que não é um backup do Lingo', () => {
    const error = new BackupFileInvalid()

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Este arquivo não é um backup do Lingo.')
  })

  it('descreve em português o backup sem dados para restaurar', () => {
    const error = new BackupEmpty()

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('O arquivo não contém dados para restaurar.')
  })
})
