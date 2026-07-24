import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export interface AnkiNote {
  fields: string[]
}

export interface AnkiDeckFile {
  /** Nome dos campos do primeiro modelo encontrado, para o usuário mapear. */
  fieldNames: string[]
  notes: AnkiNote[]
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
    const res = db.exec('SELECT flds FROM notes')
    const rows = res[0]?.values ?? []

    const notes = rows
      .map((r) => String(r[0] ?? ''))
      .map((flds) => ({ fields: flds.split('\u001f').map(stripHtml) }))
      .filter((n) => n.fields.some((f) => f.length > 0))

    if (notes.length === 0) throw new Error('Nenhuma nota encontrada no arquivo.')

    const width = Math.max(...notes.map((n) => n.fields.length))
    const names =
      fieldNames.length >= width
        ? fieldNames.slice(0, width)
        : Array.from({ length: width }, (_, i) => fieldNames[i] ?? `Campo ${i + 1}`)

    return { fieldNames: names, notes }
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
