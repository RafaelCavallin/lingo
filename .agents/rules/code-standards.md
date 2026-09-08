# Padrões de codificação

Regras obrigatórias para qualquer código escrito neste repositório (TypeScript, React, SQL e scripts). Valem tanto para código novo quanto para trechos alterados em arquivos antigos.

## 1. Nunca insira comentários

O código deve se explicar pelo nome das funções, variáveis e tipos. Comentário só é aceito quando o "porquê" é impossível de expressar em código — por exemplo, uma expressão regular complexa, um workaround de bug de terceiros ou uma regra de negócio contraintuitiva.

```ts
// ❌ Comentário que só repete o código
// pega o card e marca como sujo
async function markDirty(id: string) {
  // atualiza no banco
  await db.cards.update(id, { dirty: 1 })
}

// ✅ Sem comentário: o nome já diz tudo
async function markCardDirty(id: string) {
  await db.cards.update(id, { dirty: 1 })
}

// ✅ Exceção legítima: regex complexa
// Captura marcações {{c1::texto::dica}} do Anki: índice, conteúdo e dica opcional
const CLOZE_PATTERN = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g
```

## 2. Arquivos e classes com no máximo 100 linhas

Passou de 100 linhas, o arquivo tem mais de uma responsabilidade. Extraia para módulos irmãos.

```ts
// ❌ src/services/sync.ts com 400 linhas: pull, push, merge, parse e locks juntos

// ✅ divisão por responsabilidade
// src/services/sync.ts        -> orquestra o ciclo (pull -> merge -> push)
// src/services/syncPull.ts    -> busca paginada no Supabase
// src/services/syncPush.ts    -> envio e limpeza do dirty
// src/services/syncRows.ts    -> parse/serialize das linhas
```

Em componentes React, o mesmo vale: um componente grande vira um componente de composição + subcomponentes.

```tsx
// ❌ CardForm.tsx com formulário, editor de marcações, player de áudio e modal

// ✅
// CardForm.tsx        -> layout e submit
// MarkEditor.tsx      -> edição de marcações
// AudioPreview.tsx    -> reprodução do áudio
```

## 3. Métodos e funções com no máximo 30 linhas

Se o comportamento é maior, ele é composto por passos — dê nome a cada passo.

```ts
// ❌ 60 linhas fazendo tudo
async function importAnkiDeck(file: File) {
  const buffer = await file.arrayBuffer()
  const zip = await unzip(buffer)
  const notes = []
  for (const row of zip.rows) {
    // ...20 linhas de parse...
  }
  for (const note of notes) {
    // ...20 linhas de gravação...
  }
}

// ✅ passos nomeados, cada um curto
async function importAnkiDeck(file: File) {
  const zip = await readAnkiPackage(file)
  const notes = parseAnkiNotes(zip)
  await saveImportedNotes(notes)
}
```

## 4. Nunca aninhe mais de 3 if/else

Prefira cláusulas de guarda (early return) para tratar os casos excepcionais primeiro e deixar o caminho feliz sem indentação.

```ts
// ❌ lógica condicional acumulada
function decideOnSignIn(local: Deck | null, remote: Deck | null) {
  if (local) {
    if (remote) {
      if (local.updatedAt > remote.updatedAt) {
        return 'push'
      } else {
        return 'pull'
      }
    } else {
      return 'push'
    }
  } else {
    return remote ? 'pull' : 'noop'
  }
}

// ✅ guardas + caminho feliz reto
function decideOnSignIn(local: Deck | null, remote: Deck | null) {
  if (!local && !remote) return 'noop'
  if (!local) return 'pull'
  if (!remote) return 'push'
  return local.updatedAt > remote.updatedAt ? 'push' : 'pull'
}
```

## 5. No máximo 3 parâmetros por função

Acima disso, crie um objeto de parâmetro com um tipo nomeado — fica auto-documentado e imune a troca de ordem.

```ts
// ❌ chamada ilegível: quem lembra a ordem?
createCard('deck-1', 'ohayou', 'bom dia', 'ohayō', true, 2)

// ✅ objeto de parâmetro
type CreateCardInput = {
  deckId: string
  front: string
  back: string
  phonetic?: string
  autoAudio?: boolean
  priority?: number
}

function createCard(input: CreateCardInput) { /* ... */ }

createCard({ deckId: 'deck-1', front: 'ohayou', back: 'bom dia', phonetic: 'ohayō' })
```

## 6. Evite linhas em branco dentro de funções

Linha em branco dentro do corpo é sinal de que ali começa outra responsabilidade: extraia. Entre membros de classe ou entre funções do arquivo, a linha em branco é bem-vinda.

```ts
// ❌ blocos separados por linhas em branco dentro do corpo
function buildReviewQueue(cards: Card[]) {
  const now = Date.now()
  const due = cards.filter(card => card.dueAt <= now)

  const news = cards.filter(card => card.state === 'new')

  return [...due, ...news].slice(0, MAX_QUEUE_SIZE)
}

// ✅ corpo contínuo, com os blocos virando funções
function buildReviewQueue(cards: Card[]) {
  const queue = [...selectDueCards(cards), ...selectNewCards(cards)]
  return queue.slice(0, MAX_QUEUE_SIZE)
}

function selectDueCards(cards: Card[]) {
  return cards.filter(card => card.dueAt <= Date.now())
}

function selectNewCards(cards: Card[]) {
  return cards.filter(card => card.state === 'new')
}
```

## 7. Extraia números e strings mágicos para constantes

A constante nomeada transforma um valor solto em um conceito.

```ts
// ❌ o que é 200? e 'pt-BR'? e 3?
if (text.length > 200) return
speak(text, 'pt-BR')
for (let attempt = 0; attempt < 3; attempt++) { /* ... */ }

// ✅ conceitos explícitos
const MAX_CARD_TEXT_LENGTH = 200
const DEFAULT_SPEECH_LOCALE = 'pt-BR'
const MAX_SYNC_RETRIES = 3

if (text.length > MAX_CARD_TEXT_LENGTH) return
speak(text, DEFAULT_SPEECH_LOCALE)
for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) { /* ... */ }
```

## 8. Declare variáveis onde elas são usadas

Nada de declarar tudo no topo. A variável nasce o mais perto possível do uso, reduzindo o alcance mental necessário para ler o trecho.

```ts
// ❌ declarações longe do uso
function syncDeck(deck: Deck) {
  const rows = serializeDeck(deck)
  const startedAt = Date.now()
  if (!deck.dirty) return
  return pushRows(rows, startedAt)
}

// ✅ guarda primeiro, declarações no ponto de uso
function syncDeck(deck: Deck) {
  if (!deck.dirty) return
  const rows = serializeDeck(deck)
  return pushRows(rows, Date.now())
}
```

## 9. Nunca coloque dados sensíveis no código

Chaves de API, tokens e segredos ficam sempre em `.env` (e documentados em `.env.example`), lidos em runtime. Chaves de servidor só podem ser lidas nas funções de `api/`; no bundle do cliente só entram variáveis `VITE_*` públicas por design.

```ts
// ❌ segredo versionado no repositório
const ANTHROPIC_API_KEY = 'sk-ant-api03-Xy9...'

// ✅ .env (não versionado)
// ANTHROPIC_API_KEY=sk-ant-api03-...

// ✅ api/enrich.ts — lido do ambiente, no servidor
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) return new Response('enrich desabilitado', { status: 501 })
```

Nunca exponha `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` como `VITE_*` — isso as publicaria no bundle do navegador.
