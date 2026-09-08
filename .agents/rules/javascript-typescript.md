# JavaScript e TypeScript

Regras de linguagem obrigatórias para todo código deste repositório — `src/`, `api/`, arquivos de configuração e testes. Complementam [code-standards.md](code-standards.md) (tamanho de arquivo/função, guardas, constantes nomeadas) e [tests.md](tests.md).

Boa parte destas regras é verificada automaticamente pelo ESLint e pelo `tsc`. **Ao terminar qualquer tarefa, rode a verificação completa** (ver a última seção): código que não passa no lint não está pronto.

## 1. `const` por padrão, `let` só quando reatribui, `var` nunca

`const` é o default. Só troque para `let` quando a variável realmente recebe outro valor depois. `var` está proibido: escopo de função e hoisting produzem bugs que nenhuma das outras duas produz.

```ts
// ❌ var: escapa do bloco e vaza para o resto da função
for (var i = 0; i < cards.length; i++) { /* ... */ }

// ❌ let sem reatribuição
let dueCards = cards.filter(isDue)

// ✅ const é o padrão
const dueCards = cards.filter(isDue)

// ✅ let onde o valor muda mesmo
let consecutiveFailures = 0
function noteFailure(): void {
  consecutiveFailures++
}
```

`const` não congela o objeto: `const deck = {...}` continua permitindo `deck.name = 'x'`. Para dados que não devem mudar, veja a regra 8.

## 2. Sempre `===` e `!==`

Comparação frouxa (`==`/`!=`) faz coerção implícita e esconde erro de tipo. Nunca use, nem para comparar com `null`.

```ts
// ❌ coerção silenciosa: '0' == 0, '' == false, null == undefined
if (card.lapses == 0) return
if (deck.voice != null) speak(deck.voice)

// ✅ comparação estrita
if (card.lapses === 0) return
if (deck.voice !== null && deck.voice !== undefined) speak(deck.voice)

// ✅ melhor ainda: o operador que já trata os dois casos
if (deck.voice ?? DEFAULT_VOICE) speak(deck.voice ?? DEFAULT_VOICE)
```

## 3. Nunca `any`

`any` desliga o compilador exatamente onde ele seria mais útil. Não use — nem como anotação, nem em `as any`. As saídas legítimas, em ordem de preferência:

1. **O tipo real**, quando você o conhece.
2. **`unknown` + narrowing**, para o que vem de fora (rede, `catch`, `postMessage`, `JSON.parse`).
3. **Genérico**, quando o tipo é o do chamador.
4. **Zod**, quando o dado é externo e precisa ser validado — é o que `services/enrich.ts` e `services/syncRows.ts` já fazem.

```ts
// ❌ any: qualquer erro passa batido daqui para a frente
async function loadEnrichment(res: any): Promise<any> {
  return res.json()
}

// ✅ unknown + validação de schema no limite do sistema
async function loadEnrichment(res: Response): Promise<Enrichment> {
  const payload: unknown = await res.json()
  return enrichmentSchema.parse(payload)
}

// ✅ unknown + narrowing no catch
try {
  await syncNow('manual')
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha desconhecida.'
  showToast(message)
}

// ✅ genérico em vez de any na fila de tarefas
async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>): Promise<void> {
  /* ... */
}
```

Em teste, a mesma regra vale: use `as unknown as Tipo` para montar um fake, nunca `as any`.

## 4. Tipe parâmetros e retornos que envolvem objetos

Toda função exportada declara o tipo dos parâmetros e o tipo de retorno quando qualquer um dos dois é objeto, array, `Promise` ou união. Inferência é bem-vinda em valores primitivos triviais; não em contrato de módulo.

```ts
// ❌ o chamador só descobre o formato lendo a implementação
export async function updateCard(cardId, changes) {
  /* ... */
}

// ✅ contrato explícito, com o objeto de parâmetros nomeado
export interface CardContentChanges {
  sentence: string
  translation: string
  phonetic?: string
  hints: Hint[]
  clozeRanges?: Range[]
}

export async function updateCard(cardId: string, changes: CardContentChanges): Promise<void> {
  /* ... */
}

// ✅ inferência tudo bem em primitivo local
const total = cards.length
```

Objeto que aparece em mais de um lugar vira `interface`/`type` exportado, não um literal repetido em cada assinatura.

## 5. Arrow function em callback, `function` nas funções principais do arquivo

As funções que dão nome ao módulo — as exportadas e as auxiliares de topo — são declaradas com `function`: aparecem melhor no stack trace, sofrem hoisting e deixam claro o que o arquivo faz. Em callbacks (`map`, `filter`, `reduce`, `sort`, handlers, `then`), use arrow function.

```ts
// ❌ callback com function anônima
const ids = cards.map(function (card) {
  return card.id
})

// ❌ a função principal do módulo como const de arrow
export const buildQueue = async (deck: Deck): Promise<Card[]> => { /* ... */ }

// ✅ função principal declarada, callbacks em arrow
export async function buildQueue(deck: Deck): Promise<Card[]> {
  const all = await liveCards(deck.id).toArray()
  const due = all
    .filter((card) => card.state !== State.New && card.due <= Date.now())
    .sort((a, b) => a.due - b.due)
  return due
}

// ✅ arrow também para one-liners exportados que são só um alias
export const uid = (): string => crypto.randomUUID()
```

Componentes React seguem a mesma linha: `export function Review()` para o componente, arrow para os handlers dentro dele.

## 6. Ternário sem aninhamento

Ternário resolve uma decisão binária simples — atribuição condicional, valor de uma prop, mensagem de erro. Aninhou, virou `if`/`else`, mapa de valores ou cláusula de guarda.

```ts
// ❌ ternário aninhado: ninguém lê isso duas vezes igual
const label = card.state === State.New
  ? 'novo'
  : card.stability < 21
    ? card.state === State.Relearning
      ? 'reaprendendo'
      : 'jovem'
    : 'maduro'

// ✅ guardas, uma condição por linha
function maturityLabel(card: Card): string {
  if (card.state === State.New) return 'novo'
  if (card.state === State.Relearning) return 'reaprendendo'
  return card.stability < 21 ? 'jovem' : 'maduro'
}

// ✅ ternário simples, do jeito que ele serve
const rate = slow ? slowRate() : normalRate()
```

Vale para JSX também: dois ramos, ternário; três ou mais, extraia uma função ou um componente.

## 7. `??` e `?.` em vez de `||` e checagens encadeadas

`||` cai no fallback para qualquer valor falsy — `0`, `''` e `false` inclusive, que são valores legítimos neste domínio (velocidade `0`, `deletedAt: 0`, `listenFirst: false`).

```ts
// ❌ speechRate 0 viraria 1; listenFirst false viraria o padrão
const rate = deck.speechRate || DEFAULT_RATE

// ✅ só null/undefined caem no padrão
const rate = deck.speechRate ?? DEFAULT_RATE

// ✅ acesso opcional em vez de cadeia de checagens
const voiceName = pickAmericanVoice()?.name ?? 'padrão do navegador'
```

## 8. Prefira dados imutáveis

Não mute o que você recebeu: derive um valor novo. Além de evitar efeito colateral à distância, é o que faz o React re-renderizar.

```ts
// ❌ ordena a lista do chamador por baixo dos panos
function sortByDue(cards: Card[]): Card[] {
  return cards.sort((a, b) => a.due - b.due)
}

// ✅ copia antes de ordenar
function sortByDue(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.due - b.due)
}

// ✅ `as const` para tabelas fixas e `readonly` no que não deve ser alterado
const RATINGS = ['again', 'good'] as const
export type BinaryRating = (typeof RATINGS)[number]
```

## 9. União de strings em vez de `enum`

Uniões literais são apagadas na compilação, funcionam direto com JSON e o compilador cobre a exaustividade igual. `enum` gera código em runtime e atrapalha `isolatedModules`.

```ts
// ❌ enum
enum HintType { PhrasalVerb, FalseCognate }

// ✅ união literal, como já é feito em services/db.ts
export type HintType = 'phrasal_verb' | 'false_cognate' | 'pronunciation' | 'custom'
```

## 10. `import type` para o que é só tipo

Import de tipo é apagado na compilação: marcado como `type`, ele não puxa o pacote para o bundle. É o que mantém o `@supabase/supabase-js` fora do caminho de quem estuda offline.

```ts
// ❌ puxa o pacote inteiro para o bundle só para usar um tipo
import { SupabaseClient } from '@supabase/supabase-js'

// ✅ apagado na compilação
import type { SupabaseClient } from '@supabase/supabase-js'
```

## 11. `async`/`await`, sem promise solta

Nada de `.then()` encadeado onde `await` resolve, e nenhuma promise sem `await` ou tratamento — promise ignorada engole o erro e some com a ordem das operações. (O ESLint já barra isso com `no-floating-promises`.)

```ts
// ❌ o erro do push desaparece e o código segue como se tivesse dado certo
function sync(): void {
  syncNow('manual')
}

// ✅ espera e trata
async function sync(): Promise<void> {
  try {
    await syncNow('manual')
  } catch (error: unknown) {
    reportSyncFailure(error)
  }
}

// ✅ disparo intencional em segundo plano fica explícito
void warmNextCardAudio(card)
```

## 12. Erros são objetos `Error`

Lance `Error` ou uma subclasse nomeada — nunca string, número ou objeto solto. Erro esperado que a UI precisa distinguir ganha a própria classe, como `TtsUnavailable` e `EnrichUnavailable` já fazem.

```ts
// ❌ impossível de distinguir, sem stack trace
throw 'sem chave de API'

// ✅ classe própria para o caso que a UI trata diferente
export class EnrichUnavailable extends Error {}

throw new EnrichUnavailable('Geração automática não configurada no servidor.')
```

## 13. Exports nomeados; nada de `default`

Export nomeado mantém o mesmo nome em todos os arquivos, funciona melhor no auto-import e sobrevive a renomeação. `export default` só onde uma ferramenta obriga (config do Vite/ESLint, handler das funções em `api/`).

```ts
// ❌ cada arquivo batiza do seu jeito
export default function Review() { /* ... */ }

// ✅ um nome só, em todo lugar
export function Review() { /* ... */ }
```

## 14. Código em inglês, texto de usuário em português

Nomes de variáveis, funções, tipos e arquivos em inglês, seguindo o que já existe (`buildQueue`, `liveCards`, `deletedAt`). Tudo que o usuário lê — rótulo, mensagem de erro, texto de botão — em português. Nome de teste também em português, como manda [tests.md](tests.md).

```ts
// ❌ mistura os dois lados
function construirFilaDeEstudo(baralho: Deck): Promise<Card[]>
throw new Error('Deck not found')

// ✅ código em inglês, mensagem em português
function buildQueue(deck: Deck): Promise<Card[]>
throw new Error('Baralho não encontrado.')
```

## 15. Rode o lint ao terminar a tarefa

Antes de dar qualquer alteração por concluída, rode a verificação completa e deixe tudo verde:

```bash
npm run lint          # ESLint (regras type-aware em src/)
npm run build         # tsc -b — falha em qualquer erro de tipo
npm run test:coverage # Vitest + piso de 80% de cobertura
```

É a mesma sequência do CI (`.github/workflows/ci.yml`): o que falha aqui falha lá. Nunca "resolva" um apontamento do lint com `eslint-disable` — corrija o código. A exceção é um caso realmente inevitável, e aí o `eslint-disable-next-line` vem com a regra específica e um comentário dizendo o porquê, como o `no-control-regex` de `services/ankiImport.ts`.

### O que já é automático

| Regra deste arquivo | Verificada por |
| --- | --- |
| `const`/`let`/`var` (1) | ESLint — `prefer-const`, `no-var` |
| `===`/`!==` (2) | ESLint — `eqeqeq` |
| Sem `any` (3) | ESLint — `@typescript-eslint/no-explicit-any` e as regras `no-unsafe-*` |
| Tipagem geral (4) | `tsc` com `strict`, `noUnusedLocals`, `noUnusedParameters` |
| Promise solta (11) | ESLint — `@typescript-eslint/no-floating-promises` |
| Regras 5, 6, 8, 9, 10, 12, 13, 14 | Revisão — o lint não pega; siga na escrita |
