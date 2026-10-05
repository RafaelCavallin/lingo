---
name: criar-cenario-teste
description: Cenário de teste — monte, altere ou desmonte massas de dados no banco de TESTES (Supabase local ou lingo-dev), criando contas @lingo.test, decks, cartões em qualquer estado do FSRS e histórico de revisões, para validar uma tela ou fluxo. Nunca toca produção e nunca usa IA para preencher campos (tradução, dicas, fonética vêm de um catálogo fixo, do usuário ou de placeholders). Use quando o usuário pedir para criar, popular, preparar, alterar, excluir ou limpar dados/cenários/massa de teste no banco. Não use para testes automatizados em Vitest (eles usam o fakeSupabase), nem para migrations de schema (skill supabase), nem para dados só do navegador sem conta.
argument-hint: o que o cenário precisa ter (e o alvo, local ou dev)
---

O argumento descreve o cenário (ex.: "conta com 2 decks, 30 cartões novos e 5 vencidos ontem"). Sem argumento, pergunte o que o cenário precisa permitir testar antes de qualquer outra coisa.

Esta skill escreve direto no Postgres de um banco de **testes** para montar uma massa de dados reprodutível. Leia o `AGENTS.md`, em especial "Isolamento entre desenvolvimento e produção" e "O que nenhum agente faz sozinho": ali está por que estas travas existem.

## Regras inegociáveis

1. **Só banco de testes.** Os alvos são `local` (Docker, `127.0.0.1:54322`) e `dev` (`lingo-dev`, ref `jmswqnwghtlpxsvellar`). Produção (`supabase-gray-compass`, ref `uglvzvfgrnzoyfeotter`) é proibida, seja qual for o pedido. Se o usuário pedir dados em produção, recuse e aponte o `atualizar-producao.md`.
2. **Todo SQL passa por `./scripts/sql.sh`.** É o único caminho. O alvo é um nome, nunca uma URL, e o script recusa qualquer coisa que cite o ref de produção. Não use `psql` solto, `npx supabase db … --linked` (o link deste repositório aponta para **produção**), o MCP do Supabase, o Studio de um projeto hospedado, nem as credenciais de `.env.vercel-prod.bak`.
3. **Sem IA para preencher dados.** Frase, tradução, fonética e dicas entram literais no SQL e vêm só de: (a) texto que o usuário der, (b) `./references/frases.md`, (c) placeholders numerados. Nunca chame `/api/enrich`, nunca suba `vercel dev` para isso, nunca clique em "gerar tradução" no app, e não invente tradução, fonética nem dica na hora.
4. **Só contas `@lingo.test`.** Os helpers recusam qualquer outro e-mail. Mexer numa conta que não seja de teste exige pedido explícito do usuário, nominal, na conversa.
5. **Use os helpers.** `./references/helpers.sql` é carregado automaticamente e garante as regras do sync: `updated_at` = agora em toda escrita (o pull do app é LWW e ignora o que não for mais novo), exclusão por soft delete e e-mail de teste. SQL solto só para o que os helpers não cobrem, e seguindo as mesmas regras (ver "Alterar e excluir").

## Fluxo

1. **Entender** — descubra o que o cenário precisa permitir testar e em qual alvo. O padrão é `local`; use `dev` só se o usuário pedir (para testar no preview da `des`). Leia `./references/helpers.sql` para conhecer as funções. Se o cenário servir a uma funcionalidade em `tasks/prd-*/`, leia o PRD/TechSpec dela para acertar os casos.
   **Conclua quando:** souber o alvo, a conta, os decks/cartões/revisões necessários e o estado de cada cartão.

2. **Preparar o alvo**
   - `local`: confira com `npx supabase status`. Se não estiver no ar, suba com `npx supabase start` e anote que **você** subiu (para derrubar no fim). Portas e conflitos: "Com Supabase local" no `AGENTS.md`.
   - `dev`: peça ao usuário para exportar `LINGO_DEV_DB_PASSWORD` no próprio terminal (sem colar a senha na conversa nem gravá-la em arquivo). Se a conexão direta falhar por IPv6, ele exporta também `LINGO_DEV_DB_HOST`/`LINGO_DEV_DB_USER` do pooler (o usuário do pooler é `postgres.jmswqnwghtlpxsvellar`). O projeto hiberna depois de uma semana sem uso; se não responder, peça para despausar no dashboard.
   **Conclua quando:** `./scripts/sql.sh <alvo> -c "select 1"` responder.

3. **Escrever o cenário** — crie `tasks/cenario-<slug>/` (slug em kebab-case e em português; se a pasta existir, acrescente `-2`, `-3`…) com:
   - `aplicar.sql`: começa com `select pg_temp.apagar_usuario_teste(:'email');` para ser idempotente, cria a conta e os registros e termina com `select * from pg_temp.resumo(:'email');`;
   - `alterar.sql`, só se o teste pedir mudanças depois do estado inicial (edições, exclusões);
   - `desfazer.sql`: `select pg_temp.apagar_usuario_teste(:'email');`;
   - `cenario.md`, seguindo `./references/TEMPLATE_CENARIO.md`.

   Se o cenário for de uma funcionalidade com pasta `tasks/prd-<slug>/`, grave em `tasks/prd-<slug>/cenarios/<slug-do-cenario>/`.
   **Conclua quando:** os arquivos estiverem salvos e todos os textos tiverem origem registrada no `cenario.md`.

4. **Aplicar** — `./scripts/sql.sh <alvo> tasks/cenario-<slug>/aplicar.sql`. Tudo roda numa transação só: se der erro, nada fica pela metade. Corrija e rode de novo.
   **Conclua quando:** a saída de `pg_temp.resumo` bater com o estado esperado; cole-a no `cenario.md`.

5. **Conferir no app (quando o teste for de interface)** — suba o app conforme "Como um agente sobe o app" no `AGENTS.md` (`local` → `npm run dev -- --port <porta livre 5100–5199>`; `dev` → a URL de preview da `des`) e use a skill `agent-browser` numa **sessão limpa**: o IndexedDB guarda a cópia da última conta, e um perfil reaproveitado mistura dados ou abre o diálogo de mesclar contas. Entre com a conta do cenário; o sync do login traz tudo. Se já estiver logado, recarregue a página ou use Ajustes → **Sincronizar agora**.
   **Conclua quando:** a tela mostrar o que o cenário promete, ou a divergência tiver sido explicada ao usuário.

6. **Relatar e encerrar** — diga ao usuário, em poucas linhas, a conta e a senha, o alvo, o resumo e o caminho do `cenario.md`. Derrube só o que você subiu (app e, se foi você quem subiu, `npx supabase stop`, nunca com `--no-backup`) e confirme que as portas foram liberadas. Não faça commit sem pedido explícito.

## Helpers (resumo)

Todos recebem o e-mail da conta de teste como primeiro argumento. Intervalos são relativos a agora (`'-2 days'`, `'3 hours'`).

| Função | O que faz |
| --- | --- |
| `pg_temp.usuario_teste(email, senha)` | cria a conta já confirmada (login imediato, sem Inbucket); idempotente |
| `pg_temp.apagar_usuario_teste(email)` | apaga a conta e, em cascata, tudo dela (limpeza de cenário) |
| `pg_temp.criar_deck(email, nome, …)` | deck; opcionais: `p_novos_por_dia`, `p_limite_jovens`, `p_ouvir_primeiro`, `p_voz`, `p_velocidade`, `p_criado` |
| `pg_temp.deck(email, nome)` | id do deck vivo com esse nome |
| `pg_temp.criar_cartao(email, deck, frase, tradução, estado, vence, …)` | cartão; `estado` ∈ `novo`, `aprendendo`, `revisao`, `reaprendendo`; `vence` decide se está atrasado (`'-1 day'`) ou no futuro; opcionais: `p_fonetica`, `p_dicas`, `p_lacunas`, `p_destaques`, `p_destaques_traducao`, `p_criado` |
| `pg_temp.trecho(texto, 'palavra', …)` | faixas `[{start,end}]` para lacunas/destaques; **nunca** escreva offsets à mão |
| `pg_temp.cartao(email, frase)` | id do cartão vivo com essa frase |
| `pg_temp.criar_revisao(email, cartão, nota, quando, …)` | linha do histórico (`good`/`again`), para heatmap, sequência e estatísticas |
| `pg_temp.excluir_cartao(email, cartão)` / `pg_temp.excluir_deck(email, deck)` | soft delete, como o app faz (o deck leva os cartões junto) |
| `pg_temp.resumo(email)` | tabela de conferência por deck |

Exemplo de `aplicar.sql`:

```sql
\set email 'qa-fila@lingo.test'
select pg_temp.apagar_usuario_teste(:'email');
select pg_temp.usuario_teste(:'email', 'senha-teste-123');
select pg_temp.criar_deck(:'email', 'Inglês — viagem', p_criado => '-30 days');

-- F01, F02 e F03 de references/frases.md
select pg_temp.criar_cartao(:'email', pg_temp.deck(:'email', 'Inglês — viagem'),
  'Where is the train station?', 'Onde fica a estação de trem?');
select pg_temp.criar_cartao(:'email', pg_temp.deck(:'email', 'Inglês — viagem'),
  'I would like to check in.', 'Eu gostaria de fazer o check-in.', 'revisao', '-1 day',
  p_dicas => '[{"type":"phrasal_verb","text":"check in = registrar a entrada (hotel, aeroporto)","source":"user"}]');
select pg_temp.criar_cartao(:'email', pg_temp.deck(:'email', 'Inglês — viagem'),
  'Could you call me a taxi?', 'Você poderia chamar um táxi para mim?', 'reaprendendo',
  p_lacunas => pg_temp.trecho('Could you call me a taxi?', 'taxi'));

select pg_temp.criar_revisao(:'email', pg_temp.cartao(:'email', 'I would like to check in.'),
  'good', '-11 days', p_estado_antes => 1, p_dias_agendados => 10);

select * from pg_temp.resumo(:'email');
```

## Alterar e excluir

O app só enxerga uma mudança feita no banco se ela respeitar o protocolo do sync:

- **Alterar** é um `update` com `updated_at = pg_temp.agora_ms()`, sempre filtrando por `user_id = pg_temp.uid(:'email')`:
  ```sql
  update public.cards set translation = 'Onde fica a estação ferroviária?', updated_at = pg_temp.agora_ms()
  where user_id = pg_temp.uid(:'email') and id = pg_temp.cartao(:'email', 'Where is the train station?');
  ```
  Sem subir o `updated_at`, o pull compara com a cópia local, a do navegador vence e a mudança some em silêncio.
- **Excluir** é soft delete, com `pg_temp.excluir_cartao` ou `pg_temp.excluir_deck`. Nunca faça `delete from public.decks/cards` numa conta que já sincronizou: o navegador nunca fica sabendo e mantém o registro.
- **Histórico (`review_logs`) é imutável** no app. Para mudar o passado, rode o `aplicar.sql` de novo (ele recria a conta) e entre numa sessão limpa do navegador.
- **Estado FSRS escrito à mão** (`due`, `stability`, `state`…) só existe aqui, para posicionar cartões na fila. No código do app, quem escreve isso continua sendo só o scheduler.
- **Limpar tudo** é `pg_temp.apagar_usuario_teste`. Isso é limpeza de cenário, não exclusão do ponto de vista do app: o navegador que já sincronizou guarda a cópia local, então use sessão limpa.
