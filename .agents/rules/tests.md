# Regras de testes

Regras obrigatórias para qualquer teste automatizado deste repositório. Valem para código novo e para qualquer alteração em código existente. Complementam [code-standards.md](code-standards.md) — os padrões de codificação (tamanho de função, guardas, constantes nomeadas, sem comentários) valem igualmente dentro dos arquivos de teste.

## 1. Todo código deve ser coberto por testes automatizados

**Regra crítica — não pode ser ignorada em nenhuma hipótese.** Nenhuma função, regra de negócio ou correção de bug entra no repositório sem teste automatizado junto, no mesmo commit/PR. Não existe "depois eu escrevo o teste".

- Código novo entra com teste.
- Código alterado tem o teste atualizado (ou um novo teste que prova a mudança).
- Bug corrigido entra com um teste que **falha antes** da correção e passa depois — é assim que se prova que a correção funciona e que o bug não volta.

```ts
// ❌ Regra de negócio nova sem teste
export function isDue(card: Card, now: number) {
  return card.due <= now && card.deletedAt === 0
}

// ✅ Mesma função com teste que prova cada ramo
describe('isDue', () => {
  it('considera vencido o card com due no passado', () => {
    expect(isDue({ ...card, due: 500, deletedAt: 0 }, 1000)).toBe(true)
  })
  it('ignora card apagado mesmo vencido', () => {
    expect(isDue({ ...card, due: 500, deletedAt: 900 }, 1000)).toBe(false)
  })
  it('não antecipa card com due no futuro', () => {
    expect(isDue({ ...card, due: 1500, deletedAt: 0 }, 1000)).toBe(false)
  })
})
```

## 2. Cobertura mínima de 80%

A cobertura do projeto nunca fica abaixo de **80%**. Uma alteração que derruba a cobertura para menos disso não está pronta.

```bash
npm run test:coverage   # roda a suíte e falha se a cobertura cair abaixo de 80%
```

O piso é aplicado automaticamente: `coverage.thresholds` em `vite.config.ts` derruba o comando abaixo de 80% em statements, branches, functions ou lines, e o CI (`.github/workflows/ci.yml`) roda exatamente esse comando. O escopo medido é a lógica de negócio (`src/services/**`, `src/components/textMarks.ts`); a camada de UI fica fora do gate porque quem a valida é o e2e no Playwright.

Cobertura é **piso, não meta**: 80% com asserções fracas é pior do que 60% bem validado (ver regra 9). Nunca "resolva" a cobertura chamando a função sem verificar o retorno.

## 3. Priorize o que é mais crítico

O esforço de teste segue o risco, não a ordem alfabética dos arquivos. Um checkout é mais crítico que um cadastro de produto; um algoritmo de agendamento é mais crítico que um formulário de renomear baralho.

Ordem de prioridade ao escrever ou revisar testes:

1. **Dinheiro, dados e integridade** — sincronização (LWW, keyset, CAS, ordem de push), agendamento FSRS, parse/serialize de linhas, autenticação e decisões de merge local × remoto.
2. **Fluxos que o usuário faz todo dia** — sessão de revisão, criar/editar card, importar baralho.
3. **Periferia** — telas de configuração, formatação de texto, rótulos.

```ts
// ❌ Bateria enorme para o trivial, nada para o crítico
describe('formatDeckName', () => { /* 12 casos de string */ })

// ✅ O caminho perigoso coberto nos limites e nos erros
describe('sync push', () => {
  it('envia cards antes dos logs para não violar a FK', async () => { /* ... */ })
  it('não limpa dirty quando o updatedAt mudou durante o push (CAS)', async () => { /* ... */ })
  it('mantém a versão remota quando ela é mais recente (LWW)', async () => { /* ... */ })
  it('aborta sem perder dados quando o lock já está tomado', async () => { /* ... */ })
})
```

## 4. Siga a pirâmide de testes

Base larga de **unidade**, camada média de **integração**, topo estreito de **e2e**. Proporção alvo aproximada: 70% unidade / 20% integração / 10% e2e.

| Nível | O que cobre | Onde | Ferramenta |
| --- | --- | --- | --- |
| Unidade | Funções puras e regras de negócio isoladas, com dependências substituídas por stub/mock | `src/services/*.test.ts`, `src/components/*.test.ts` | Vitest |
| Integração | Módulos conversando de verdade: Dexie real em memória (`fake-indexeddb`), fake do `SupabaseClient`, componente + contexto | `src/services/*.test.ts` com `src/test/dbHelpers.ts` | Vitest |
| E2E | Jornadas completas no navegador: entrar, revisar um card, sincronizar | `e2e/*.spec.ts` | Playwright |

E2E é caro e lento: reserve para as jornadas de maior valor (uma sessão de revisão completa, login + sync), nunca para validar variações de regra — isso é papel do teste de unidade.

## 5. Ferramentas obrigatórias

- **Unidade e integração:** [Vitest](https://vitest.dev) — já configurado em `vite.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`). Rode com `npm test`.
- **Cobertura:** [@vitest/coverage-v8](https://vitest.dev/guide/coverage) — `npm run test:coverage`, com o piso de 80% configurado em `vite.config.ts`.
- **E2E:** [Playwright](https://playwright.dev) — preferência obrigatória sobre qualquer outro runner de browser (Cypress, Selenium, WebdriverIO).

Não introduza outro runner de teste no repositório. As funções de backend em `api/` são Edge Functions em TypeScript e também são testadas com Vitest.

## 6. Estruture todo teste em AAA (ou Given/When/Then)

Todo teste tem três blocos claros e nessa ordem: **Arrange** (prepara o estado), **Act** (executa a ação testada), **Assert** (valida o resultado). Given/When/Then é o mesmo desenho com outro nome. Um teste só executa **uma** ação — se precisar de dois "Act", são dois testes.

```ts
// ❌ Arrange, act e assert embaralhados, várias ações no mesmo teste
it('sincroniza', async () => {
  const deck = await createDeck({ name: 'Inglês' })
  expect(deck.dirty).toBe(1)
  await pushDeck(deck)
  const again = await db.decks.get(deck.id)
  await pushDeck(again!)
  expect(again!.dirty).toBe(0)
})

// ✅ Um Act por teste, blocos separados
it('limpa a flag dirty após o push bem-sucedido', async () => {
  const deck = await seedDirtyDeck({ name: 'Inglês' })

  await pushDeck(deck)

  const stored = await db.decks.get(deck.id)
  expect(stored?.dirty).toBe(0)
})
```

O nome do teste descreve o **comportamento esperado**, não o método: `limpa a flag dirty após o push bem-sucedido`, nunca `testa pushDeck`.

## 7. FAST — testes rápidos

A suíte precisa rodar em segundos, senão ninguém a roda. Nada de rede real, arquivo em disco, `setTimeout` de verdade ou banco remoto: substitua por **stub**.

```ts
// ❌ Chama a API de verdade: lento, quebra offline, quebra no CI
it('enriquece a frase', async () => {
  const result = await enrich('I gave up')
  expect(result.translation).toBeTruthy()
})

// ✅ Stub da fronteira: mesma regra testada, milissegundos
it('usa a tradução devolvida pelo provedor', async () => {
  const fetchStub = vi.fn().mockResolvedValue(jsonResponse({ translation: 'Eu desisti' }))

  const result = await enrich('I gave up', { fetch: fetchStub })

  expect(result.translation).toBe('Eu desisti')
})
```

Para esperas, use timers falsos em vez de dormir de verdade:

```ts
// ❌ 2 segundos parados por teste
await new Promise((resolve) => setTimeout(resolve, 2000))

// ✅ tempo controlado
vi.useFakeTimers()
vi.advanceTimersByTime(2000)
```

## 8. INDEPENDENT — testes independentes entre si

Nenhum teste pode depender do estado, da ordem ou do resultado de outro. Se um teste base quebra e derruba os demais, o diagnóstico vira adivinhação. Cada teste monta o próprio cenário e limpa o que criou.

```ts
// ❌ O segundo teste só passa se o primeiro rodou antes
let deckId: string
it('cria o baralho', async () => {
  deckId = (await createDeck({ name: 'Inglês' })).id
  expect(deckId).toBeTruthy()
})
it('adiciona card ao baralho', async () => {
  await createCard({ deckId, front: 'give up' })
  expect(await db.cards.count()).toBe(1)
})

// ✅ Cada teste monta seu próprio cenário, do zero
beforeEach(async () => {
  await resetDb()
})
it('adiciona card ao baralho', async () => {
  const deck = await createDeck({ name: 'Inglês' })

  await createCard({ deckId: deck.id, front: 'give up' })

  expect(await db.cards.where({ deckId: deck.id }).count()).toBe(1)
})
```

Sinais de dependência proibida: variáveis mutáveis no escopo do `describe`, `beforeAll` que popula dados que os testes alteram, testes que só passam na ordem em que estão escritos.

## 9. REPEATABLE — mesmo resultado em toda execução

Rodar dez vezes, em qualquer máquina, online ou offline, deve dar o mesmo resultado. Toda fonte de não-determinismo — relógio, aleatoriedade, rede, fuso, id gerado — entra no teste como **mock/fake controlado**.

```ts
// ❌ Depende do relógio real e do fuso da máquina: quebra à meia-noite e no CI
it('agenda a próxima revisão para amanhã', () => {
  const next = scheduleNext(card)
  expect(new Date(next.due).getDate()).toBe(new Date().getDate() + 1)
})

// ✅ Tempo, aleatoriedade e rede fixados
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('card-fixo')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('agenda a próxima revisão para 24h depois', () => {
  const next = scheduleNext(card)

  expect(next.due).toBe(Date.parse('2026-01-02T12:00:00Z'))
})
```

Chamadas externas usam os fakes já existentes do repositório (`src/test/fakeSupabase.ts`, `fake-indexeddb`), nunca o serviço real.

## 10. SELF-VALIDATING — o teste prova o comportamento sozinho

O teste passa ou falha por conta própria, sem ninguém lendo log. E precisa **quebrar de verdade** quando o comportamento quebra — cobertura sem asserção forte é cobertura falsa.

```ts
// ❌ Passa com qualquer implementação: não valida nada
it('faz o parse da linha', () => {
  const card = parseCardRow(validCardRow())
  expect(card).toBeDefined()
  console.log(card)
})

// ❌ Asserção frouxa: passaria com o campo errado
expect(result.length).toBeGreaterThan(0)

// ✅ Valida o valor e o comportamento observável
it('converte a linha remota preservando due, stability e deletedAt', () => {
  const card = parseCardRow(validCardRow())

  expect(card).toEqual({
    id: 'card-1',
    deckId: 'deck-1',
    front: 'give up',
    due: 2000,
    stability: 3.5,
    deletedAt: 0,
  })
})

// ✅ Erro também é comportamento: valide o tipo e a mensagem
it('rejeita linha sem deckId', () => {
  expect(() => parseCardRow({ ...validCardRow(), deck_id: null }))
    .toThrow(/deck_id/)
})
```

Checklist antes de dar um teste por pronto: se eu inverter a condição da função testada, este teste falha? Se a resposta for não, a asserção está fraca.
