---
name: executar-task
description: Tarefa — identifique e implemente a próxima tarefa de uma funcionalidade a partir do PRD, da TechSpec e do tasks.md, marcando-a como concluída ao final. Use quando o usuário pedir para executar, implementar ou começar uma tarefa/subtarefa, ou dar continuidade à implementação de uma funcionalidade. Não use para revisar (executar-review) nem validar em QA (executar-qa) o que já foi implementado.
argument-hint: --prd nome-da-funcionalidade
---

O argumento `--prd` identifica o slug da funcionalidade. Sem argumento, localize a pasta em `./tasks/prd-*/`. Os arquivos obrigatórios em `tasks/prd-[slug]/` são `prd.md`, `techspec.md` e `tasks.md`; se algum estiver ausente, pare e indique a skill correspondente (`/criar-prd`, `/criar-techspec` ou `/criar-tasks`).

Uma tarefa é uma **entrega incremental**, com dependências explícitas e testes próprios. Implemente todas as subtarefas e passe do plano à implementação assim que a abordagem estiver clara. Referencie o `techspec.md` em vez de repetir detalhes de implementação.

## Fluxo

1. **Selecionar a tarefa** — identifique a próxima tarefa não concluída no `tasks.md`; abra o arquivo `task_[num].md` correspondente e leia sua definição, subtarefas (`[num].1`, `[num].2`…), critérios de aceitação relacionados e testes.
   **Conclua quando:** a próxima tarefa e todas as suas subtarefas estiverem identificadas.

2. **Preparar** — leia o `AGENTS.md` e todas as rules em `.agents/rules/`; revise o contexto do PRD e os requisitos da TechSpec para a tarefa; entenda as dependências de tarefas anteriores; carregue as skills aplicáveis conforme a tabela “Skills” do `AGENTS.md` e consulte na web a documentação das bibliotecas envolvidas quando necessário.
   Antes de criar qualquer arquivo, confira em `.agents/rules/folder-structure.md` onde ele mora e quais são as regras de dependência entre camadas (`src/services/` nunca importa React; `screens/`/`components/` só falam com dados via `services/`; nada em `src/` importa de `api/`).
   Quando a tarefa exigir rodar a aplicação, siga “Como um agente sobe o app” no `AGENTS.md`: `npm run dev -- --port <5100–5199>` para UI, `npx vercel dev --listen <3000–3099>` quando precisar das funções `api/`, e `npx supabase start` (portas fixas `54321–54327`) para contas e sincronização. Verifique a porta antes de subir e registre porta e processo.
   **Conclua quando:** a abordagem estiver clara, o `AGENTS.md` e todas as rules tiverem sido consultados, as skills aplicáveis estiverem carregadas e os serviços necessários estiverem disponíveis.

3. **Implementar** — implemente cada subtarefa na ordem. Toda regra de negócio nova ou alterada em `src/services/` entra com teste no mesmo passo (`.agents/rules/tests.md`, regra 1) — não deixe teste para depois. Ao final, rode `npm run lint`, `npm run test:coverage` e `npm run build`.
   Se a tarefa mexer no schema, crie uma migration nova em `supabase/migrations/` e valide com `npx supabase db reset` — nunca edite uma migration já aplicada nem toque no banco de produção.
   **Conclua quando:** toda subtarefa estiver implementada, os testes da tarefa existirem e `npm run lint`, `npm run test:coverage` (piso de 80% em `src/services/**`) e `npm run build` passarem.

4. **Concluir e limpar** — marque como concluídas (`[x]`) todas as subtarefas e os testes aplicáveis no arquivo `task_[num].md`. Depois, marque a tarefa como concluída (`[x]`) no `tasks.md`, informe, em uma linha, o que foi implementado e desligue todos os serviços iniciados por esta execução. Encerre os processos de forma graciosa, confirme que as portas foram liberadas e não encerre processos do usuário ou de outra sessão. Faça essa limpeza também se a execução for interrompida ou bloqueada.
   Não faça commit, push, merge nem deploy: veja “O que nenhum agente faz sozinho” no `AGENTS.md`.
   **Conclua quando:** todas as subtarefas e os testes aplicáveis estiverem marcados no arquivo da tarefa, e a tarefa estiver marcada como concluída no `tasks.md`.
