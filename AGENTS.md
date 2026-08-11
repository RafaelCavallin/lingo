# AGENTS.md

Guia rápido para qualquer agente/LLM trabalhando neste repositório. Para a explicação detalhada de cada arquivo/componente, veja [ARQUITETURA.md](ARQUITETURA.md); para a visão de produto, veja [README.md](README.md).

## Mapa das pastas

| Pasta | Papel | Tecnologias |
| --- | --- | --- |
| `src/` | **Frontend** — SPA React que roda 100% no navegador, offline-first, instalável como PWA. | React 18 + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB), ts-fsrs |
| `src/services/` | Toda a lógica de negócio e acesso a dados (sem JSX) — nunca importa React. | Dexie, ts-fsrs, Zod, Supabase JS |
| `src/screens/`, `src/components/`, `src/contexts/` | Camada de UI: uma tela por caso de uso, componentes reutilizáveis, estado global (sessão + baralho ativo). | React |
| `src/workers/` | Web Worker que roda o otimizador do FSRS em wasm, fora da thread principal. | fsrs-browser (wasm) |
| `api/` | **Backend** — funções serverless (Edge Functions), sem servidor próprio. Só existem para esconder chaves de API; não persistem nada. | Vercel Edge Runtime (Fetch API padrão, sem Node) |
| `supabase/migrations/` | Schema do Postgres (tabelas `decks`/`cards`/`review_logs`), RLS e a RPC `sync_push` usada pela sincronização entre aparelhos. | Postgres (via Supabase) |
| `supabase/` (resto) | Config local da CLI do Supabase (`config.toml`) e artefatos gerados — não editar `.temp/`, `pgdelta/`. | Supabase CLI |

A conta/sincronização é **opcional**: sem Supabase configurado, o app funciona 100% offline com Dexie local. O `api/` e o `supabase/` só entram em jogo se o usuário configurar chaves.

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
npx supabase db push # aplica as migrations de supabase/migrations/
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` com os valores impressos por `supabase start` (ou os de um projeto hospedado).

## Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher o que for necessário — tudo é opcional, cada bloco liga uma funcionalidade independente:

- `ENRICH_PROVIDER` (`anthropic` padrão ou `gemini`) + `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — geração automática de tradução/dicas.
- `OPENAI_API_KEY` + `TTS_VOICE` / `TTS_MODEL` — voz neural.
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — contas e sincronização. Essas duas vão para o bundle do cliente por design; **nunca** colocar `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` aqui.

## Build

```bash
npm run build        # tsc -b (type-check) + vite build de produção
npm run preview       # serve o build de produção localmente, para conferir antes de deployar
```

`npm run build` falha se houver erro de tipo — é o mesmo check que roda no CI/deploy da Vercel.

## Testes

**Não há suíte de testes configurada neste projeto** (sem Jest/Vitest/Playwright, sem script `test` no `package.json`). Validação hoje é feita por:
- `npm run build` (type-check via `tsc -b`);
- teste manual no navegador (`npm run dev` ou `npx vercel dev`).

Se for adicionar uma suíte de testes, atualizar esta seção com o comando e o framework escolhido.
