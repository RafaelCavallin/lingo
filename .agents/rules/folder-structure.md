# Estrutura de pastas

Onde cada tipo de arquivo mora neste repositório e o que pode (ou não) importar o quê. Vale para código novo: arquivo criado no lugar errado é dívida imediata. Para a explicação detalhada de cada arquivo, veja [ARQUITETURA.md](../../ARQUITETURA.md).

## Visão geral

```
lingo/
├── src/                      Frontend — SPA React, offline-first, instalável como PWA
│   ├── main.tsx              Ponto de entrada: monta o React e registra o service worker
│   ├── App.tsx               Casca do app: providers de contexto e roteamento entre telas
│   ├── index.css             Entrada do Tailwind + estilos globais
│   ├── vite-env.d.ts         Tipos do Vite (import.meta.env, imports com ?url)
│   ├── screens/              Uma tela por caso de uso
│   ├── components/           Componentes reutilizáveis entre telas
│   ├── contexts/             Estado global (sessão, baralho ativo, navegação)
│   ├── services/             Lógica de negócio e acesso a dados — sem JSX
│   ├── workers/              Web Workers (trabalho pesado fora da thread principal)
│   └── test/                 Infra de teste: setup, fakes e helpers
├── api/                      Backend — funções serverless na Edge da Vercel
│   ├── _lib/                 Código compartilhado entre as funções (não vira rota)
│   ├── enrich.ts             POST /api/enrich — tradução e dicas via LLM
│   └── tts.ts                POST /api/tts — voz neural (MP3)
├── supabase/
│   ├── migrations/           Schema do Postgres, RLS e RPCs — fonte da verdade do banco
│   ├── config.toml           Config da CLI do Supabase para o ambiente local
│   └── .temp/                Artefatos gerados pela CLI — nunca editar
├── tasks/                    Artefatos das skills, uma pasta por funcionalidade
│   └── prd-<slug>/           prd.md, techspec.md, tasks.md, task_N.md, codereview.md, qa.md, evidences/
├── .agents/rules/            Regras obrigatórias para agentes/LLMs (este arquivo mora aqui)
├── .agents/skills/           Fluxos de trabalho para agentes (ver AGENTS.md)
├── .github/workflows/        CI (lint, build e testes com cobertura)
├── AGENTS.md                 Guia de trabalho no repositório
├── ARQUITETURA.md            Explicação detalhada de cada arquivo/componente
├── README.md                 Visão de produto
└── index.html                HTML raiz servido pelo Vite
```

## Frontend (`src/`)

| Pasta | O que mora aqui | Tecnologias |
| --- | --- | --- |
| `src/screens/` | Uma tela por caso de uso: `Home`, `Review`, `AddCard`, `EditCard`, `Cards`, `Import`, `Progress`, `Settings`, `Account`. | React |
| `src/components/` | Componentes reutilizados por mais de uma tela: `CardForm`, `MarkableField`, `MarkedText`, `Heatmap`, `Waveform`, `MobileNav`, `DeckSwitcher`… | React |
| `src/contexts/` | Estado global: `AuthContext` (sessão), `DeckContext` (baralho ativo), `NavigationContext` (tela atual). | React |
| `src/services/` | Toda a lógica de negócio e acesso a dados: `db` (Dexie + migrations), `scheduler` (FSRS), `sync`/`syncRows`, `auth`, `audio`, `recorder`, `enrich`, `stats`, `optimizer`, `ankiImport`, `supabase`. | Dexie, ts-fsrs, Zod, Supabase JS |
| `src/workers/` | Web Workers — hoje só `optimizer.worker.ts`, que roda o otimizador do FSRS em wasm fora da thread principal. | fsrs-browser (wasm) |
| `src/test/` | Infra de teste, nunca lógica de produção: `setup.ts` (carrega o `fake-indexeddb`, fake da Web Locks API), `fakeSupabase.ts`, `dbHelpers.ts`. | Vitest |

### Regras de dependência

Estas direções valem sempre — quebrar qualquer uma delas é motivo para recusar a mudança:

- `src/services/` **nunca importa React** nem nada de `screens/`, `components/` ou `contexts/`. É a camada que roda igual num teste de unidade e no navegador.
- `screens/` e `components/` conversam com os dados só através de `services/` — nada de abrir o Dexie ou chamar o Supabase direto do JSX.
- `components/` não importa de `screens/`. Se um componente precisa de algo de uma tela, o que ele precisa é de props.
- `src/test/` é importado apenas por arquivos de teste.
- Nada em `src/` importa de `api/`: são runtimes diferentes, que só se falam por HTTP.

### Onde colocar cada coisa nova

| O que você está escrevendo | Onde vai |
| --- | --- |
| Uma tela inteira, ligada a um caso de uso | `src/screens/Nome.tsx` |
| Um pedaço de UI usado por duas telas ou mais | `src/components/Nome.tsx` |
| Uma função pura de apoio a um componente | ao lado dele, em `src/components/nome.ts` (ex.: `textMarks.ts`) |
| Regra de negócio, consulta ou escrita no banco | `src/services/nome.ts` |
| Estado compartilhado por telas distantes | `src/contexts/NomeContext.tsx` |
| Processamento pesado que trava a interface | `src/workers/nome.worker.ts` |
| Teste de qualquer um dos anteriores | ao lado do arquivo testado, como `nome.test.ts` |
| Fake ou helper usado por vários testes | `src/test/nome.ts` |
| PRD, TechSpec, tarefas e relatórios de uma funcionalidade | `tasks/prd-<slug>/` |

## Backend (`api/`)

Funções serverless no Edge Runtime da Vercel — Fetch API padrão, **sem APIs do Node** (`fs`, `process.cwd`, `Buffer`). Existem só para esconder chaves de API: não persistem nada e não têm banco.

- Cada arquivo `.ts` na raiz de `api/` vira uma rota (`api/tts.ts` → `POST /api/tts`).
- Arquivos e pastas com `_` na frente (`api/_lib/`) **não** viram rota: é onde fica o código compartilhado entre funções.
- Sem a chave correspondente no ambiente, a rota responde `501` e o frontend cai no fallback local — isso é comportamento esperado, não erro.

## Banco (`supabase/`)

- `supabase/migrations/` é a fonte da verdade do schema: tabelas `decks`/`cards`/`review_logs`, políticas de RLS e a RPC `sync_push` usada pela sincronização. Toda mudança de schema entra como uma migration nova, com timestamp no nome — nunca editando uma migration já aplicada.
- `supabase/config.toml` configura a CLI local.
- `supabase/.temp/` e artefatos gerados: nunca editar nem versionar à mão.

A conta/sincronização é **opcional**: sem Supabase configurado, o app funciona 100% offline com o Dexie local. `api/` e `supabase/` só entram em jogo quando o usuário configura as chaves.

## Pastas geradas (nunca editar, nunca versionar)

`node_modules/`, `dist/`, `dev-dist/`, `coverage/`, `.vercel/`, `supabase/.temp/`, `tsconfig.tsbuildinfo`.
