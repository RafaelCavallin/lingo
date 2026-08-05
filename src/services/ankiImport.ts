import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export interface AnkiNote {
  fields: string[]
  /** Baralho de origem no Anki; '' quando o arquivo não traz essa informação. */
  deckName: string
}

export interface AnkiDeckFile {
  /** Nome dos campos do primeiro modelo encontrado, para o usuário mapear. */
  fieldNames: string[]
  notes: AnkiNote[]
  /** Baralhos de origem presentes no arquivo, ordenados por nome. */
  deckNames: string[]
}

/**
 * Um .apkg é um ZIP com um banco SQLite dentro. Lemos as notas e deixamos o
 * mapeamento de campos para o usuário — só o conteúdo é importado, não o
 * histórico de revisões (o agendamento recomeça no FSRS).
 */
export async function readApkg(file: File): Promise<AnkiDeckFile> {
  const zip = await JSZip.loadAsync(file)
  const entry =
    zip.file('collection.anki21') ?? zip.file('collection.anki2') ?? zip.file('collection.anki21b')

  if (!entry) {
    throw new Error(
      'Este arquivo não tem uma coleção legível. Exporte do Anki como .apkg sem a opção de esquema novo.',
    )
  }

  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const db = new SQL.Database(new Uint8Array(await entry.async('arraybuffer')))

  try {
    const fieldNames = readFieldNames(db)
    const deckNames = readDeckNames(db)
    const noteDecks = readNoteDecks(db)
    const res = db.exec('SELECT id, flds FROM notes')
    const rows = res[0]?.values ?? []

    const notes = rows
      .map((r) => ({
        fields: String(r[1] ?? '').split('\u001f').map(stripHtml),
        deckName: deckNames.get(noteDecks.get(Number(r[0])) ?? 0) ?? '',
      }))
      .filter((n) => n.fields.some((f) => f.length > 0))

    if (notes.length === 0) throw new Error('Nenhuma nota encontrada no arquivo.')

    const width = Math.max(...notes.map((n) => n.fields.length))
    const names =
      fieldNames.length >= width
        ? fieldNames.slice(0, width)
        : Array.from({ length: width }, (_, i) => fieldNames[i] ?? `Campo ${i + 1}`)

    // Só entram no filtro os baralhos que têm nota — uma coleção exportada
    // inteira costuma trazer baralhos vazios que só poluiriam a lista.
    const usedDecks = dedupe(notes.map((n) => n.deckName).filter(Boolean)).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )

    return { fieldNames: names, notes, deckNames: usedDecks }
  } finally {
    db.close()
  }
}

function readFieldNames(db: import('sql.js').Database): string[] {
  // Anki novo: tabela notetypes/fields. Anki antigo: JSON na coluna col.models.
  try {
    const res = db.exec('SELECT name FROM fields ORDER BY ord')
    const names = res[0]?.values.map((r) => String(r[0])) ?? []
    if (names.length) return dedupe(names)
  } catch {
    /* schema antigo */
  }

  try {
    const res = db.exec('SELECT models FROM col')
    const models = JSON.parse(String(res[0]?.values[0][0] ?? '{}')) as Record<
      string,
      { flds?: { name: string; ord: number }[] }
    >
    const first = Object.values(models)[0]
    if (first?.flds) {
      return [...first.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name)
    }
  } catch {
    /* sem metadados de campo */
  }

  return []
}

/**
 * Nome de cada baralho da coleção. Serve só para o usuário filtrar o que quer
 * importar — no Lingo tudo vai para o baralho ativo, não recriamos a hierarquia.
 */
function readDeckNames(db: import('sql.js').Database): Map<number, string> {
  const names = new Map<number, string>()

  // Anki novo: tabela decks, com \u001f separando os níveis de subbaralho.
  try {
    const res = db.exec('SELECT id, name FROM decks')
    for (const r of res[0]?.values ?? []) {
      names.set(Number(r[0]), String(r[1] ?? '').replace(/\u001f/g, '::'))
    }
    if (names.size) return names
  } catch {
    /* schema antigo */
  }

  // Anki antigo: JSON na coluna col.decks, já com '::' entre os níveis.
  try {
    const res = db.exec('SELECT decks FROM col')
    const decks = JSON.parse(String(res[0]?.values[0][0] ?? '{}')) as Record<
      string,
      { name?: string }
    >
    for (const [id, deck] of Object.entries(decks)) {
      if (deck?.name) names.set(Number(id), deck.name)
    }
  } catch {
    /* sem metadados de baralho: o filtro simplesmente não aparece */
  }

  return names
}

/**
 * Baralho de cada nota. Uma nota pode gerar vários cartões em baralhos
 * diferentes; para filtrar basta o primeiro. `odid` guarda o baralho de origem
 * quando o cartão está parado num baralho filtrado.
 */
function readNoteDecks(db: import('sql.js').Database): Map<number, number> {
  const byNote = new Map<number, number>()
  try {
    const res = db.exec('SELECT nid, did, odid FROM cards')
    for (const r of res[0]?.values ?? []) {
      const nid = Number(r[0])
      if (byNote.has(nid)) continue
      byNote.set(nid, Number(r[2]) || Number(r[1]))
    }
  } catch {
    /* sem tabela cards utilizável */
  }
  return byNote
}

const dedupe = (xs: string[]) => [...new Set(xs)]

/** As notas do Anki guardam HTML; a frase precisa ser texto limpo para o TTS. */
function stripHtml(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<div[^>]*>/gi, ' ')
    .replace(/\[sound:[^\]]*\]/gi, '')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Executa tarefas com concorrência limitada — usado para gerar o áudio em lote
 * sem estourar o rate limit da API de TTS.
 */
export async function runPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 3,
  onProgress?: (done: number) => void,
): Promise<void> {
  let next = 0
  let done = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      try {
        await worker(items[i], i)
      } catch {
        // Uma falha de áudio não invalida a importação: o cartão entra sem narração
        // e o áudio é gerado na primeira revisão.
      }
      onProgress?.(++done)
    }
  })
  await Promise.all(runners)
}
