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

Não há Supabase local em Docker: em desenvolvimento o banco é o projeto hospedado `lingo-dev` (ver "Isolamento entre desenvolvimento e produção"). Em produção, o frontend + `api/` são deployados juntos na Vercel e o banco é outro projeto hospedado.

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

### Com contas e sincronização

Não há nada para subir: `npm run dev` e `npx vercel dev` já falam com o `lingo-dev`, porque o `.env.local` tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` dele (Project Settings → API Keys, no dashboard). Tabelas e usuários se inspecionam no dashboard do `lingo-dev`.

Se o login falhar sem motivo aparente, o projeto pode estar hibernando (free tier, depois de cerca de uma semana sem uso) — despause no dashboard.

## Isolamento entre desenvolvimento e produção

Desenvolvimento **nunca** fala com o banco de produção. São dois bancos distintos, selecionados só por variáveis de ambiente:

| Ambiente | Banco | Quem usa |
| --- | --- | --- |
| Local e Preview | projeto hospedado `lingo-dev` (`dufnekbwxjklsugkvnve`) | `npm run dev`/`npx vercel dev` via `.env.local` (que tem prioridade sobre `.env` no Vite) e os preview deploys de qualquer branch via escopos Preview/Development da Vercel |
| Produção | projeto hospedado `supabase-gray-compass` (`uglvzvfgrnzoyfeotter`) | só o deploy da branch **`prod`** — via escopo Production da Vercel |

Local e preview dividem o mesmo banco: o que se cria rodando na máquina aparece no preview da `des`, e vice-versa.

### URLs

| Ambiente | URL | Acesso |
| --- | --- | --- |
| Produção | `https://lingo-mu-nine.vercel.app` | público, sem login |
| Preview da `des` | `https://lingo-git-des-rafaelcavallin89-3287s-projects.vercel.app` | exige login na Vercel (Deployment Protection) |

O alias `lingo-git-des-…` sempre aponta para o deploy mais recente da branch `des`. Não há domínio customizado; `lingo-mu-nine.vercel.app` é o domínio de produção gerado pela Vercel.

Atenção ao mapa de branches: `prod` é a branch de produção, `des` é a de desenvolvimento. A `main` **não** dispara deploy de produção.

Nada sobe para produção automaticamente, e essa é uma decisão deliberada: **só se promove para a `prod` o que já foi validado 100% no preview da `des`**. Push na `des` não promove nada, merge na `main` não promove nada — produção só muda quando alguém mergeia na `prod` à mão. Migration em produção também é sempre manual e vem antes do deploy. O roteiro completo está em [atualizar-producao.md](atualizar-producao.md); nenhum agente deve executá-lo por conta própria.

### Como o deploy acontece

O deploy é feito pelo GitHub Actions com a Vercel CLI, no job `deploy` do `.github/workflows/ci.yml`, e só roda depois que `lint`, `build` e `test:coverage` passarem. A integração Git da Vercel continua conectada, mas os deploys automáticos dela estão desligados (`git.deploymentEnabled: false` no `vercel.json`).

- Push na `prod` → deploy de produção. Push em qualquer outra branch → preview, com as variáveis do escopo Preview.
- Pull request não faz deploy, só roda o CI.
- Deploy feito pela CLI não ganha sozinho o endereço fixo da branch (`lingo-git-<branch>-…vercel.app`); um passo do job aponta esse endereço para o deploy de preview novo.
- O job usa os secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` do repositório no GitHub. O token pertence à conta do Rafael; se expirar, o deploy falha no passo `vercel pull`.
- Para refazer um deploy sem commit novo, rode de novo o workflow na aba Actions (ou `gh run rerun <id>`).

O `.env` (fora do git) aponta para `127.0.0.1:54321`, onde não roda nada, de propósito: é a rede de segurança caso o `.env.local` seja apagado — o app fica sem conta, mas nunca cai em produção.

Consequências práticas:

- As credenciais de produção **não moram no repositório**. Ficam na Vercel (escopo Production); há uma cópia local em `.env.vercel-prod.bak` (ignorada pelo git).
- **Nunca rode `npx vercel env pull` sem argumento**: ele sobrescreve o `.env.local` com valores remotos e fura o isolamento. Puxe para outro nome: `npx vercel env pull .env.vercel-prod.bak`.
- O projeto de produção pertence à organização gerenciada pela integração Supabase da **Vercel Marketplace**, que injeta credenciais nos três escopos de uma vez — foi assim que Preview e Development passaram a apontar para produção. O `lingo-dev` foi criado fora dessa organização justamente para ficar fora do alcance dela. Se algum dia a integração for reconfigurada, **confira `npx vercel env ls` depois**.
- As demais variáveis que a integração injetou (`SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_*`, `NEXT_PUBLIC_*`) não são lidas por nenhum código deste repositório — `api/` só usa `ENRICH_*`, `OPENAI_API_KEY` e `TTS_*`.
- Contas são por projeto Supabase, então a conta de estudo real não existe no `lingo-dev` — crie um usuário de teste. O servidor de e-mail padrão do Supabase manda poucos e-mails por hora; para teste, crie a conta já confirmada (Authentication → Users → Add user, com "Auto Confirm User", ou pelo `/criar-cenario-teste`).
- O IndexedDB do navegador já é isolado por origem: `localhost:5173`, a URL de preview e o domínio de produção têm bancos locais separados sem nenhuma configuração.
- O `lingo-dev` está no free tier e **hiberna após cerca de uma semana sem acesso**; despausar é um clique no dashboard do Supabase.

### Fluxo de uma migration nova

1. Aplica no `lingo-dev`: `npx supabase db push --db-url "postgresql://postgres:<senha>@db.dufnekbwxjklsugkvnve.supabase.co:5432/postgres"`. Se a conexão direta falhar por IPv6, use a URL do pooler (dashboard → Connect → Session pooler; o usuário é `postgres.dufnekbwxjklsugkvnve`). Confira com `npx supabase migration list --db-url "<mesma url>"`. Não há banco descartável para ensaiar: revise a migration com cuidado antes do push, porque ela vale na hora para o local e para o preview.
2. Valida rodando o app local e no preview da `des`.
3. Em produção, **nunca automaticamente**: só à mão, depois de a mudança ter sido validada de ponta a ponta no preview da `des`, e sempre antes do deploy que depende dela. Passo a passo em [atualizar-producao.md](atualizar-producao.md).

Use sempre `--db-url` explícito em vez de `supabase link` + `db push`: o link deste repositório aponta para **produção**, então um `db push --linked` distraído escreve no banco real.

## Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher o que for necessário — tudo é opcional, cada bloco liga uma funcionalidade independente:

- `ENRICH_PROVIDER` (`anthropic` padrão ou `gemini`) + `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — geração automática de tradução/dicas.
- `OPENAI_API_KEY` + `TTS_VOICE` / `TTS_MODEL` — voz neural.
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — contas e sincronização. Essas duas vão para o bundle do cliente por design; **nunca** colocar `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` aqui. Em desenvolvimento apontam para o `lingo-dev` e moram no `.env.local` — ver "Isolamento entre desenvolvimento e produção" acima.

## Build

```bash
npm run build        # tsc -b (type-check) + vite build de produção
npm run preview       # serve o build de produção localmente, para conferir antes de deployar
```

`npm run build` falha se houver erro de tipo — é o mesmo check que roda no CI (`.github/workflows/ci.yml`, junto de `lint`/`test:coverage`).

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

Para mudanças pequenas e bem delimitadas (ajuste, correção de bug, refatoração localizada) há o atalho `/quick-task`: plano curto aprovado pelo usuário → implementação → validação → revisão leve → resumo, tudo em `tasks/quick-<slug>/` (`plano.md` e `resumo.md`). As rules valem do mesmo jeito; se a tarefa crescer, ela redireciona para a esteira completa.

Para montar massa de dados de teste há o `/criar-cenario-teste`: cria, altera e exclui contas `@lingo.test`, decks, cartões e revisões **só** no `lingo-dev`, sempre por `.agents/skills/criar-cenario-teste/scripts/sql.sh`, que recusa produção. Os textos vêm de um catálogo fixo (`references/frases.md`), do usuário ou de placeholders, nunca de IA. Os cenários ficam em `tasks/cenario-<slug>/`.

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
| Contas e sincronização | nada — qualquer um dos dois acima já usa o `lingo-dev` | — |

Confira que a porta está livre antes de subir (`ss -ltn "sport = :<porta>"`) e registre no relatório qual porta e qual processo você iniciou.

Não suba `npx supabase start`: o projeto não usa mais Supabase local em Docker.

Ao terminar — inclusive se a execução for interrompida ou bloqueada — encerre graciosamente só os processos que você iniciou e confirme que as portas foram liberadas. Nunca mate processos do usuário ou de outra sessão.

## Versionamento

O Lingo usa SemVer (`MAJOR.MINOR.PATCH`), com a versão no `package.json`. A `prod` de hoje é a `1.0.0` (tag `v1.0.0`).

| Incrementa | Quando | Exemplo |
| --- | --- | --- |
| PATCH | Só correções e ajustes pequenos (`/quick-task`) | `1.0.0` → `1.0.1` |
| MINOR | Ao menos uma funcionalidade nova (PRD entregue) | `1.0.1` → `1.1.0` |
| MAJOR | Quebra de compatibilidade para o usuário (backup antigo que deixa de abrir, sync incompatível com aparelho não atualizado) | `1.4.2` → `2.0.0` |

- **Uma versão por promoção à `prod`**, definida na `des` antes do merge (passo 3 de [atualizar-producao.md](atualizar-producao.md)), com `npm version <patch|minor|major>` e a tag `vX.Y.Z`. Entre duas promoções a versão não muda.
- O build expõe `APP_VERSION` (`src/services/appVersion.ts`) como `X.Y.Z+<commit curto>`, ou `X.Y.Z+dev` fora do CI. Aparece no fim de Ajustes e é a versão do app gravada nos backups.
- Nenhum agente roda `npm version`, cria tag ou promove sozinho: faz parte do roteiro manual de produção.

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

