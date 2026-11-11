import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RestoreError } from './RestoreError'

describe('RestoreError', () => {
  it('anuncia a mensagem de erro a leitores de tela com role alert', () => {
    const markup = renderToStaticMarkup(<RestoreError message="Este arquivo não é um backup do Lingo." />)

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Este arquivo não é um backup do Lingo.')
  })
})
