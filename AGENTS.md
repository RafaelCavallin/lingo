# AGENTS.md

Guia rápido para qualquer agente/LLM trabalhando neste repositório. Para a explicação detalhada de cada arquivo/componente, veja [ARQUITETURA.md](ARQUITETURA.md); para a visão de produto, veja [README.md](README.md).

## Regras

- [.agents/rules/code-standards.md](.agents/rules/code-standards.md) — padrões de codificação obrigatórios (tamanho de arquivos/funções, cláusulas de guarda, objetos de parâmetro, constantes nomeadas, segredos fora do código). Leia antes de escrever ou alterar qualquer código.
- [.agents/rules/javascript-typescript.md](.agents/rules/javascript-typescript.md) — regras de linguagem (`const` sobre `let`, nunca `var`, sempre `===`, nunca `any`, tipagem de parâmetros/retornos, arrow em callbacks, ternário sem aninhamento) e a verificação a rodar ao fim de cada tarefa.
- [.agents/rules/tests.md](.agents/rules/tests.md) — regras de testes obrigatórias (cobertura mínima de 80%, prioridade pelo que é crítico, pirâmide de testes, princípios FIRST, estrutura AAA/Given-When-Then, Vitest + Playwright). **Todo código deve entrar com teste automatizado** — leia antes de escrever qualquer código ou teste.
- [.agents/rules/folder-structure.md](.agents/rules/folder-structure.md) — estrutura de pastas: o que mora em cada uma, as regras de dependência entre camadas e onde colocar cada arquivo novo. Leia antes de criar qualquer arquivo.

## Onde cada coisa roda (portas)

| Serviço | Porta | Como sobe |
| --- | --- | --- |
| Frontend (Vite dev server) | `5173` | `npm run dev` |
| Frontend + funções `api/` juntas | `3000` (padrão da Vercel CLI) | `npx vercel dev` |
| Supabase local — API/PostgREST | `54321` | `npx supabase start` |
| Supabase local — Postgres | `54322` | `npx supabase start` |
| Supabase local — Studio (UI) | `54323` | `npx supabase start` |
| Supabase local — Inbucket (e-mails de teste) | `54324` | `npx supabase start` |
| Supabase local — Auth/GoTrue | `54327` | `npx supabase start` |

Em produção, o frontend + `api/` são deployados juntos na Vercel; o banco é um projeto Supabase hospedado (não o local acima).

## Como rodar

```bash
npm install        # instala dependências (única vez / após mudar package.json)
npm run dev         # sobe só o frontend em http://localhost:5173, SEM `api/`
```

Sem nenhuma chave de API o app já funciona por completo: cadastro de frase manual, voz do navegador, sem conta. É o modo mais rápido para mexer em UI/lógica de estudo.

### Com as funções `api/` (tradução automática, voz neural, sync)

As funções em `api/` dependem do runtime da Vercel — `npm run dev` (Vite puro) **não** as serve.

```bash
npx vercel dev       # sobe frontend + api/ juntos, http://localhost:3000
```

Requer `.env` preenchido a partir de `.env.example` (ver seção abaixo). Sem isso as rotas voltam 501 e o app cai de volta nos fallbacks locais (voz do navegador, sem tradução automática) — não é um erro fatal.

### Com Supabase local (contas e sincronização)

```bash
npx supabase start   # sobe Postgres + Auth + Studio locais (ver portas acima)
npx supabase stop    # derruba; os dados ficam salvos no volume do Docker
```

`start` já aplica as migrations de `supabase/migrations/` sozinho (`db.migrations.enabled = true` no `config.toml`) — `db push` só é necessário contra um projeto hospedado. Para zerar o banco e reaplicar tudo do zero, use `npx supabase db reset`.

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` já vêm preenchidos com os valores locais (ver a seção abaixo); reimprima-os a qualquer momento com `npx supabase status`.

Se `start` falhar com `port is already allocated`, há outro projeto Supabase local ocupando as portas. Derrube-o de qualquer diretório com `npx supabase stop --project-id <id-do-outro-projeto>` — sem `--no-backup`, os dados dele são preservados.

## Isolamento entre desenvolvimento e produção

Desenvolvimento **nunca** fala com o banco de produção. São três bancos distintos, selecionados só por variáveis de ambiente:

| Ambiente | Banco | Quem usa |
| --- | --- | --- |
| Local | Supabase em Docker (`127.0.0.1:54321`) | `npm run dev`, `npx vercel dev` — via `.env.local`, que tem prioridade sobre `.env` no Vite |
| Preview | projeto hospedado `lingo-dev` (`jmswqnwghtlpxsvellar`) | preview deploys de qualquer branch — via escopos Preview/Development da Vercel |
| Produção | projeto hospedado `supabase-gray-compass` (`uglvzvfgrnzoyfeotter`) | só o deploy da branch **`prod`** — via escopo Production da Vercel |

### URLs

| Ambiente | URL | Acesso |
| --- | --- | --- |
| Produção | `https://lingo-mu-nine.vercel.app` | público, sem login |
| Preview da `des` | `https://lingo-git-des-rafaelcavallin89-3287s-projects.vercel.app` | exige login na Vercel (Deployment Protection) |

O alias `lingo-git-des-…` sempre aponta para o deploy mais recente da branch `des`. Não há domínio customizado; `lingo-mu-nine.vercel.app` é o domínio de produção gerado pela Vercel.

Atenção ao mapa de branches: `prod` é a branch de produção, `des` é a de desenvolvimento. A `main` **não** dispara deploy de produção.

Nada sobe para produção automaticamente, e essa é uma decisão deliberada: **só se promove para a `prod` o que já foi validado 100% no preview da `des`**. Push na `des` não promove nada, merge na `main` não promove nada — produção só muda quando alguém mergeia na `prod` à mão. Migration em produção também é sempre manual e vem antes do deploy. O roteiro completo está em [atualizar-producao.md](atualizar-producao.md); nenhum agente deve executá-lo por conta própria.

O `.env` versionado aponta para o local de propósito: é a rede de segurança caso o `.env.local` seja apagado.

Consequências práticas:

- As credenciais de produção **não moram no repositório**. Ficam na Vercel (escopo Production); há uma cópia local em `.env.vercel-prod.bak` (ignorada pelo git).
- **Nunca rode `npx vercel env pull` sem argumento**: ele sobrescreve o `.env.local` com valores remotos e fura o isolamento. Puxe para outro nome: `npx vercel env pull .env.vercel-prod.bak`.
- O projeto de produção pertence à organização gerenciada pela integração Supabase da **Vercel Marketplace**, que injeta credenciais nos três escopos de uma vez — foi assim que Preview e Development passaram a apontar para produção. O `lingo-dev` foi criado fora dessa organização justamente para ficar fora do alcance dela. Se algum dia a integração for reconfigurada, **confira `npx vercel env ls` depois**.
- As demais variáveis que a integração injetou (`SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_*`, `NEXT_PUBLIC_*`) não são lidas por nenhum código deste repositório — `api/` só usa `ENRICH_*`, `OPENAI_API_KEY` e `TTS_*`.
- Contas são por projeto Supabase, então a conta de estudo real não existe nem no local nem no `lingo-dev` — crie um usuário de teste em cada. No local, os e-mails de confirmação chegam no Inbucket (`http://localhost:54324`), não na caixa de entrada real.
- O IndexedDB do navegador já é isolado por origem: `localhost:5173`, a URL de preview e o domínio de produção têm bancos locais separados sem nenhuma configuração.
- O `lingo-dev` está no free tier e **hiberna após cerca de uma semana sem acesso**; despausar é um clique no dashboard do Supabase.

### Fluxo de uma migration nova

1. Valida no local: `npx supabase db reset` (recria do zero e reaplica tudo).
2. Aplica no `lingo-dev`: `npx supabase db push --db-url "postgresql://postgres:<senha>@db.jmswqnwghtlpxsvellar.supabase.co:5432/postgres"`.
3. Em produção, **nunca automaticamente**: só à mão, depois de a mudança ter sido validada de ponta a ponta no preview da `des`, e sempre antes do deploy que depende dela. Passo a passo em [atualizar-producao.md](atualizar-producao.md).

Use sempre `--db-url` explícito em vez de `supabase link` + `db push`: o link deste repositório aponta para **produção**, então um `db push --linked` distraído escreve no banco real.

## Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher o que for necessário — tudo é opcional, cada bloco liga uma funcionalidade independente:

- `ENRICH_PROVIDER` (`anthropic` padrão ou `gemini`) + `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — geração automática de tradução/dicas.
- `OPENAI_API_KEY` + `TTS_VOICE` / `TTS_MODEL` — voz neural.
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — contas e sincronização. Essas duas vão para o bundle do cliente por design; **nunca** colocar `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` aqui. Em desenvolvimento apontam para o banco local — ver "Isolamento entre desenvolvimento e produção" acima.

## Build

```bash
npm run build        # tsc -b (type-check) + vite build de produção
npm run preview       # serve o build de produção localmente, para conferir antes de deployar
```

`npm run build` falha se houver erro de tipo — é o mesmo check que roda no CI (`.github/workflows/ci.yml`, junto de `lint`/`test:coverage`) e no deploy da Vercel.

## Testes

```bash
npm test             # Vitest (jsdom), roda uma vez e sai
npm run test:coverage # o mesmo, com relatório de cobertura e o piso de 80%
```

As regras que todo teste deve seguir estão em [.agents/rules/tests.md](.agents/rules/tests.md) — cobertura mínima de 80%, princípios FIRST e estrutura AAA.

Cobre toda a lógica de negócio de `src/services/` — sincronização (LWW, paginação por keyset, CAS no clearDirty, ordem cards-antes-de-logs no push, mutex de `navigator.locks`), autenticação, parse/serialize das linhas remotas, agendamento FSRS, estatísticas, áudio/TTS com fallback, gravação, importação do Anki, otimizador e as migrations do banco local — usando `fake-indexeddb` (Dexie real em memória), um fake `SupabaseClient` escrito à mão (`src/test/fakeSupabase.ts`) e stubs das APIs do navegador, sem mexer no código de produção para isso.

**Não cobre UI/telas** (sem `@testing-library`/Playwright), e por isso `src/screens/`, `src/components/*.tsx` e `src/contexts/` ficam fora do escopo medido pela cobertura. A validação de componentes React continua manual (`npm run dev` ou `npx vercel dev`), junto do type-check via `npm run build`.

## Skills

As skills em [.agents/skills/](.agents/skills/) são fluxos de trabalho prontos. As do projeto formam uma esteira: `/criar-prd` → `/criar-techspec` → `/criar-tasks` → `/executar-task` (uma vez por tarefa) → `/executar-review` → `/executar-qa`. Todas gravam seus artefatos em `tasks/prd-<slug>/`.

As demais são de terceiros e vêm do `skills-lock.json` (`agent-browser`, `supabase`, `vercel-cli`, `vercel-react-best-practices`, `vercel-composition-patterns`) ou foram instaladas à mão (`impeccable`, para trabalho de design de interface). **Não edite skills de terceiros** — a próxima atualização sobrescreve, e alterar o conteúdo invalida o hash do lockfile. Ajustes específicos deste projeto vão aqui no `AGENTS.md` ou nas rules.

A `impeccable` **não é versionada** (`.gitignore`): são ~5 MB de bundles de navegador e um índice de fontes de 1 MB, e ela não está no `skills-lock.json`. Num clone limpo ela simplesmente não existe — instale-a à mão em `.agents/skills/impeccable/` e refaça o link com `ln -s ../../.agents/skills/impeccable .claude/skills/impeccable`.

Cada skill em `.agents/skills/` precisa de um symlink correspondente em `.claude/skills/` para o Claude Code enxergá-la. Ao adicionar uma skill nova: `ln -s ../../.agents/skills/<nome> .claude/skills/<nome>`.

Skills relevantes por tipo de mudança:

| Mexendo em | Consulte |
| --- | --- |
| `src/` (React) | `vercel-react-best-practices`, `vercel-composition-patterns` |
| Interface/design visual | `impeccable` |
| `supabase/migrations/`, RLS, RPC, auth | `supabase` |
| `api/`, deploy, variáveis de ambiente | `vercel-cli` |
| Validar um fluxo no navegador | `agent-browser` |

## Comandos de validação

Estes são os únicos comandos de validação do projeto — nenhuma skill deve inventar outros:

| Comando | O que faz | Quando é obrigatório |
| --- | --- | --- |
| `npm run lint` | ESLint | toda alteração em `src/` ou `api/` |
| `npm test` | Vitest, uma vez e sai | durante o desenvolvimento |
| `npm run test:coverage` | Vitest + piso de 80% | antes de fechar qualquer tarefa, review ou QA |
| `npm run build` | `tsc -b` + build de produção | antes de fechar qualquer tarefa, review ou QA |

Sobre cobertura: o piso de 80% mede só `src/services/**` e `src/components/textMarks.ts` (ver `coverage.thresholds` em `vite.config.ts`). **Não** exija cobertura de `src/screens/`, `src/components/*.tsx` ou `src/contexts/` — essa camada é validada no navegador, não pelo gate.

Sobre E2E: **não há Playwright instalado nem pasta `e2e/`** hoje. Casos `E2E-*` de uma TechSpec são executados manualmente com a skill `agent-browser` contra o app rodando, com evidência em captura de tela — não tente rodar `npx playwright` nem criar `e2e/*.spec.ts` sem alinhar antes com o Rafael.

## Como um agente sobe o app

O app **não** se divide em "backend numa porta, frontend em outra": `npx vercel dev` serve o frontend e as funções `api/` juntos, no mesmo processo.

| Precisa de | Suba | Porta |
| --- | --- | --- |
| Só UI e lógica de estudo | `npm run dev -- --port <porta>` | escolha uma livre em `5100–5199` |
| `api/` também (tradução, voz, sync) | `npx vercel dev --listen <porta>` | escolha uma livre em `3000–3099` |
| Contas e sincronização | `npx supabase start` | **portas fixas** `54321–54327` |

Confira que a porta está livre antes de subir (`ss -ltn "sport = :<porta>"`) e registre no relatório qual porta e qual processo você iniciou.

As portas do Supabase local **não são realocáveis**: vêm do `supabase/config.toml` e o `.env.local` aponta para elas. Se `npx supabase start` falhar com `port is already allocated`, é outro projeto Supabase ocupando-as — derrube-o com `npx supabase stop --project-id <id-do-outro>` (nunca com `--no-backup`) e avise o usuário de qual projeto você derrubou.

Ao terminar — inclusive se a execução for interrompida ou bloqueada — encerre graciosamente só os processos que você iniciou e confirme que as portas foram liberadas. Nunca mate processos do usuário ou de outra sessão.

## Commits

**Nunca assine o commit como coautor.** Não acrescente `Co-Authored-By: Claude ... <noreply@anthropic.com>` — nem nenhuma outra linha de atribuição a um modelo — à mensagem do commit ou à descrição de um PR, seja qual for o modelo da vez. Isso vale mesmo quando a configuração da ferramenta mandar assinar: esta regra tem precedência.

A mensagem descreve a mudança e o porquê dela; quem escreveu é assunto do `git log`, não do corpo do commit.

## O que nenhum agente faz sozinho

Ações fora do alcance de qualquer skill, sem pedido explícito do Rafael na conversa:

- **Promover para produção.** Merge na `prod`, deploy de produção ou qualquer passo de [atualizar-producao.md](atualizar-producao.md).
- **Rodar migration em produção**, ou `npx supabase db push --linked` (o link deste repositório aponta para produção). Use sempre `--db-url` explícito.
- **`npx vercel env pull` sem argumento** — sobrescreve o `.env.local` e fura o isolamento. Se precisar, puxe para `.env.vercel-prod.bak`.
- **Escrever variáveis de ambiente no escopo Production.** Prepare o comando e entregue para o Rafael executar.
- **Editar migration já aplicada.** Toda mudança de schema entra como migration nova.

