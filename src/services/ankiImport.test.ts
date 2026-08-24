import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readApkg, runPool } from './ankiImport'

const { loadAsync, initSql } = vi.hoisted(() => ({ loadAsync: vi.fn(), initSql: vi.fn() }))

vi.mock('jszip', () => ({ default: { loadAsync } }))
vi.mock('sql.js', () => ({ default: initSql }))

/** O Anki separa os campos de uma nota (e os níveis de subbaralho) com 0x1f. */
const SEP = '\u001f'

interface CollectionSpec {
  fields?: string[]
  models?: Record<string, { flds: { name: string; ord: number }[] }>
  decks?: [number, string][]
  colDecks?: Record<string, { name: string }>
  cards?: [number, number, number][]
  notes: [number, string][]
}

let closed = 0

/** Banco falso: tabela ausente lança, como faria o SQLite de um .apkg antigo. */
function fakeDatabase(spec: CollectionSpec) {
  const rows = (values: unknown[][]) => [{ columns: [], values }]
  return {
    exec(sql: string) {
      if (sql.includes('FROM fields')) {
        if (!spec.fields) throw new Error('no such table: fields')
        return rows(spec.fields.map((name) => [name]))
      }
      if (sql.includes('models FROM col')) {
        if (!spec.models) throw new Error('no such column: models')
        return rows([[JSON.stringify(spec.models)]])
      }
      if (sql.includes('FROM decks')) {
        if (!spec.decks) throw new Error('no such table: decks')
        return rows(spec.decks.map(([id, name]) => [id, name]))
      }
      if (sql.includes('decks FROM col')) {
        if (!spec.colDecks) throw new Error('no such column: decks')
        return rows([[JSON.stringify(spec.colDecks)]])
      }
      if (sql.includes('FROM cards')) {
        if (!spec.cards) throw new Error('no such table: cards')
        return rows(spec.cards.map(([nid, did, odid]) => [nid, did, odid]))
      }
      return rows(spec.notes.map(([id, flds]) => [id, flds]))
    },
    close() {
      closed++
    },
  }
}

function givenApkg(spec: CollectionSpec, entryName = 'collection.anki21') {
  const entry = { async: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }
  loadAsync.mockResolvedValue({
    file: (name: string) => (name === entryName ? entry : null),
  })
  initSql.mockResolvedValue({
    Database: vi.fn(function () {
      return fakeDatabase(spec)
    }),
  })
}

function givenZipSemColecao() {
  loadAsync.mockResolvedValue({ file: () => null })
}

const apkg = new File([], 'baralho.apkg')

beforeEach(() => {
  closed = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('readApkg', () => {
  it('lê as notas, os campos e os baralhos de uma coleção do Anki novo', async () => {
    givenApkg({
      fields: ['Frente', 'Verso'],
      decks: [
        [1, 'Inglês'],
        [2, 'Espanhol'],
      ],
      cards: [
        [10, 1, 0],
        [11, 2, 0],
      ],
      notes: [
        [10, `I gave up${SEP}Eu desisti`],
        [11, `Me rindo${SEP}Eu desisto`],
      ],
    })

    const result = await readApkg(apkg)

    expect(result.fieldNames).toEqual(['Frente', 'Verso'])
    expect(result.notes).toEqual([
      { fields: ['I gave up', 'Eu desisti'], deckName: 'Inglês' },
      { fields: ['Me rindo', 'Eu desisto'], deckName: 'Espanhol' },
    ])
    expect(result.deckNames).toEqual(['Espanhol', 'Inglês'])
  })

  it('limpa o HTML, as quebras e as marcações de áudio das notas', async () => {
    givenApkg({
      fields: ['Frente'],
      decks: [[1, 'Inglês']],
      cards: [[10, 1, 0]],
      notes: [[10, '<div>I <b>gave</b><br>up</div>[sound:audio.mp3] now']],
    })

    const result = await readApkg(apkg)

    expect(result.notes[0].fields[0]).toBe('I gave up now')
  })

  it('cai para os metadados em JSON quando o schema é antigo', async () => {
    givenApkg({
      models: {
        '1': {
          flds: [
            { name: 'Verso', ord: 1 },
            { name: 'Frente', ord: 0 },
          ],
        },
      },
      colDecks: { '1': { name: 'Inglês::Phrasal verbs' } },
      cards: [[10, 1, 0]],
      notes: [[10, `I gave up${SEP}Eu desisti`]],
    })

    const result = await readApkg(apkg)

    expect(result.fieldNames).toEqual(['Frente', 'Verso'])
    expect(result.deckNames).toEqual(['Inglês::Phrasal verbs'])
  })

  it('nomeia os campos por posição quando não há metadado nenhum', async () => {
    givenApkg({ notes: [[10, `frente${SEP}verso${SEP}extra`]] })

    const result = await readApkg(apkg)

    expect(result.fieldNames).toEqual(['Campo 1', 'Campo 2', 'Campo 3'])
    expect(result.deckNames).toEqual([])
  })

  it('corta os nomes de campo que passam da largura das notas', async () => {
    givenApkg({
      fields: ['Frente', 'Verso', 'Áudio', 'Notas'],
      notes: [[10, `I gave up${SEP}Eu desisti`]],
    })

    const result = await readApkg(apkg)

    expect(result.fieldNames).toEqual(['Frente', 'Verso'])
  })

  it('traduz o separador de subbaralho do Anki novo para ::', async () => {
    givenApkg({
      fields: ['Frente'],
      decks: [[1, `Inglês${SEP}Frases`]],
      cards: [[10, 1, 0]],
      notes: [[10, 'I gave up']],
    })

    const result = await readApkg(apkg)

    expect(result.notes[0].deckName).toBe('Inglês::Frases')
  })

  it('usa o baralho de origem quando o cartão está num baralho filtrado', async () => {
    givenApkg({
      fields: ['Frente'],
      decks: [
        [1, 'Filtrado'],
        [2, 'Inglês'],
      ],
      cards: [[10, 1, 2]],
      notes: [[10, 'I gave up']],
    })

    const result = await readApkg(apkg)

    expect(result.notes[0].deckName).toBe('Inglês')
  })

  it('deixa o baralho vazio quando a nota não tem cartão', async () => {
    givenApkg({
      fields: ['Frente'],
      decks: [[1, 'Inglês']],
      cards: [[99, 1, 0]],
      notes: [[10, 'I gave up']],
    })

    const result = await readApkg(apkg)

    expect(result.notes[0].deckName).toBe('')
    expect(result.deckNames).toEqual([])
  })

  it('lista cada baralho uma vez só, em ordem alfabética', async () => {
    givenApkg({
      fields: ['Frente'],
      decks: [
        [1, 'Inglês'],
        [2, 'Árabe'],
        [3, 'Vazio']
      ],
      cards: [
        [10, 1, 0],
        [11, 1, 0],
        [12, 2, 0],
      ],
      notes: [
        [10, 'a'],
        [11, 'b'],
        [12, 'c'],
      ],
    })

    const result = await readApkg(apkg)

    expect(result.deckNames).toEqual(['Árabe', 'Inglês'])
  })

  it('descarta notas totalmente vazias', async () => {
    givenApkg({
      fields: ['Frente'],
      notes: [
        [10, 'I gave up'],
        [11, SEP],
      ],
    })

    const result = await readApkg(apkg)

    expect(result.notes).toHaveLength(1)
  })

  it('recusa arquivo sem coleção legível', async () => {
    givenZipSemColecao()

    await expect(readApkg(apkg)).rejects.toThrow(/não tem uma coleção legível/)
  })

  it('aceita os nomes alternativos de coleção do Anki', async () => {
    for (const name of ['collection.anki2', 'collection.anki21b']) {
      givenApkg({ fields: ['Frente'], notes: [[10, 'I gave up']] }, name)

      await expect(readApkg(apkg)).resolves.toMatchObject({ notes: [{ fields: ['I gave up'] }] })
    }
  })

  it('avisa quando a coleção não tem nota nenhuma e fecha o banco', async () => {
    givenApkg({ fields: ['Frente'], notes: [] })

    await expect(readApkg(apkg)).rejects.toThrow('Nenhuma nota encontrada no arquivo.')
    expect(closed).toBe(1)
  })

  it('fecha o banco depois de uma leitura bem-sucedida', async () => {
    givenApkg({ fields: ['Frente'], notes: [[10, 'I gave up']] })

    await readApkg(apkg)

    expect(closed).toBe(1)
  })
})

describe('runPool', () => {
  it('processa todos os itens', async () => {
    const processados: number[] = []

    await runPool([1, 2, 3, 4, 5], async (n) => {
      await Promise.resolve()
      processados.push(n)
    })

    expect([...processados].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('nunca passa da concorrência pedida', async () => {
    let rodando = 0
    let maiorSimultaneo = 0

    await runPool(
      [1, 2, 3, 4, 5, 6],
      async () => {
        rodando++
        maiorSimultaneo = Math.max(maiorSimultaneo, rodando)
        await Promise.resolve()
        rodando--
      },
      2,
    )

    expect(maiorSimultaneo).toBe(2)
  })

  it('segue em frente quando um item falha', async () => {
    const feitos: number[] = []

    await runPool(
      [1, 2, 3],
      async (n) => {
        await Promise.resolve()
        if (n === 2) throw new Error('sem áudio')
        feitos.push(n)
      },
      1,
    )

    expect(feitos).toEqual([1, 3])
  })

  it('informa o progresso a cada item, inclusive nos que falharam', async () => {
    const progresso: number[] = []

    await runPool(
      [1, 2, 3],
      async (n) => {
        await Promise.resolve()
        if (n === 2) throw new Error('sem áudio')
      },
      1,
      (done) => progresso.push(done),
    )

    expect(progresso).toEqual([1, 2, 3])
  })

  it('não faz nada com a lista vazia', async () => {
    const worker = vi.fn()

    await runPool([], worker)

    expect(worker).not.toHaveBeenCalled()
  })

  it('passa o índice de cada item para o worker', async () => {
    const indices: number[] = []

    await runPool(
      ['a', 'b', 'c'],
      async (_item, index) => {
        await Promise.resolve()
        indices.push(index)
      },
      1,
    )

    expect(indices).toEqual([0, 1, 2])
  })
})
