---
name: criar-techspec
description: TechSpec — especificação técnica derivada de um PRD existente. Use quando o usuário pedir uma TechSpec ou a arquitetura de uma funcionalidade que já tenha um PRD em `tasks/prd-*/prd.md`. Não use sem PRD (criar-prd) nem para decompor em tarefas (criar-tasks).
argument-hint: --prd nome-da-funcionalidade
---

O argumento `--prd` identifica o slug da funcionalidade. Sem argumento, localize a pasta em `./tasks/prd-*/`. O PRD obrigatório é `tasks/prd-[slug]/prd.md`; se não existir, pare e indique `/criar-prd`.

A TechSpec define a arquitetura, os componentes, os contratos e os testes da solução. O problema, os objetivos e o escopo já estão no PRD; referencie-o em vez de repetir essas informações. Especifique sem implementar: inclua código somente nos exemplos de interface do template. Prefira uma arquitetura simples e evolutiva, com interfaces claras.

## Fluxo

1. **Analisar o PRD** — leia-o por completo; extraia requisitos, critérios de aceitação, restrições e métricas de sucesso.
   **Conclua quando:** os requisitos, os critérios de aceitação, as restrições e as métricas de sucesso estiverem identificados.

2. **Explorar o projeto** — leia o `AGENTS.md`, todas as rules em `.agents/rules/` e o [ARQUITETURA.md](../../../ARQUITETURA.md), que explica arquivo por arquivo. Use o agente Explore antes de perguntar qualquer coisa ao usuário. Examine os arquivos e módulos afetados, as interfaces e os pontos de integração, quem chama e quem é chamado, a persistência, o tratamento de erros e os testes existentes. Avalie se é melhor reutilizar o que já existe ou construir do zero. Pesquise na web a documentação das bibliotecas envolvidas.

   Neste projeto, cheque especificamente:
   - **Onde cada peça mora e o que pode importar o quê** — `.agents/rules/folder-structure.md`. `src/services/` é lógica de negócio sem React; `screens/`/`components/` só falam com dados via `services/`; nada em `src/` importa de `api/`.
   - **Serviços já existentes em `src/services/`** antes de criar outro: `db` (Dexie + migrations locais), `scheduler` (FSRS), `sync`/`syncRows`, `auth`, `audio`, `recorder`, `enrich`, `stats`, `optimizer`, `ankiImport`, `supabase`.
   - **Se a mudança toca o schema** — migration nova em `supabase/migrations/`, com RLS; consulte a skill `supabase`.
   - **Se precisa de segredo** — a chave nunca vai para o cliente: entra como rota nova em `api/` (Edge Runtime, sem APIs do Node), que responde `501` sem a chave e deixa o frontend cair no fallback local.
   - **Impacto offline** — como a funcionalidade se comporta sem rede, sem conta e sem chave de API; e, se escreve dados sincronizáveis, como ela interage com LWW, `dirty`/CAS e a ordem cards-antes-de-logs no push.

   **Conclua quando:** for possível nomear cada componente novo ou modificado, indicar em qual pasta ele mora e como ele se comporta offline.

3. **Esclarecer** — faça perguntas ao usuário usando `AskUserQuestion` antes de redigir. Concentre-se no que a exploração não esclareceu: limites do domínio, fluxo de dados e contratos, dependências externas (modos de falha, timeouts e idempotência), interfaces principais e cenários de teste críticos.
   **Conclua quando:** toda pergunta tiver uma resposta ou premissa explícita.

4. **Redigir** — leia `./references/TEMPLATE.md` desta skill na íntegra e siga sua estrutura exatamente. Em “Conformidade com o AGENTS.md e as rules”, confirme a leitura do `AGENTS.md` e de todas as rules em `.agents/rules/`. Em “Conformidade com skills”, verifique as skills aplicáveis pela tabela “Skills” do `AGENTS.md` e registre os desvios com justificativa. Em “Abordagem de testes”, defina os casos aplicáveis, nomeados e identificados por camada (`TU-*` para testes de unidade, `TI-*` para testes de integração e `E2E-*` para testes E2E), associando cada caso aos critérios de aceitação que ele verifica.

Neste projeto, a abordagem de testes é fixa (`.agents/rules/tests.md`): Vitest para unidade e integração, com `fake-indexeddb` (Dexie real em memória), o fake `SupabaseClient` de `src/test/fakeSupabase.ts` e os helpers de `src/test/dbHelpers.ts` — nunca rede, disco ou banco remoto de verdade. Proporção alvo 70/20/10, piso de cobertura de 80% medido só em `src/services/**` e `src/components/textMarks.ts`. Os casos `E2E-*` são executados à mão no `/executar-qa` com a skill `agent-browser`: **não há Playwright instalado nem pasta `e2e/`**, então especifique cada `E2E-*` como um roteiro de passos verificáveis no navegador, não como um arquivo de teste a escrever. Não proponha outro runner de teste.
   **Conclua quando:** toda seção do template estiver preenchida e cada componente do passo 2 estiver especificado.

5. **Salvar e reportar** — grave o documento em `tasks/prd-[slug]/techspec.md` e informe o caminho com um resumo de uma linha.
