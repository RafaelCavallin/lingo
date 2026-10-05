---
name: quick-task
description: Tarefa rápida — planeje, aprove com o usuário, implemente, teste, revise e resuma uma mudança pequena e bem delimitada (ajuste, correção de bug, refatoração localizada, melhoria pontual), sem PRD nem TechSpec. Grava o plano e o resumo em `tasks/quick-<slug>/`. Use quando o usuário pedir uma tarefa rápida, um ajuste ou correção pontual, ou invocar /quick-task. Não use para funcionalidades novas que precisem de requisitos de produto ou arquitetura — essas seguem a esteira /criar-prd → /criar-techspec → /criar-tasks → /executar-task.
argument-hint: descrição da tarefa
---

O argumento é a descrição da tarefa. Sem argumento, pergunte ao usuário o que deve ser feito antes de qualquer outra coisa.

Esta skill é a versão enxuta da esteira de SDD: um único plano curto no lugar de PRD + TechSpec + tasks, implementação direta e uma revisão leve contra as rules. Ela **não** dispensa as regras do projeto — `AGENTS.md` e `.agents/rules/` valem integralmente.

Todos os artefatos ficam em `tasks/quick-<slug>/`, onde `<slug>` é um nome descritivo em kebab-case e em português derivado da tarefa (ex.: `quick-corrigir-contador-da-home`). Se a pasta já existir, acrescente um sufixo numérico (`-2`, `-3`…) em vez de sobrescrever.

## Quando parar e redirecionar

Antes de planejar, avalie o tamanho. Se a tarefa exigir decisões de produto em aberto, mudança de schema com impacto em sincronização, mexer em mais de uma camada de forma estrutural ou passar de um punhado de arquivos, diga isso ao usuário e sugira a esteira completa (`/criar-prd`). Só siga com esta skill se ele confirmar.

## Fluxo

1. **Entender** — leia o `AGENTS.md`, todas as rules em `.agents/rules/` e o código envolvido na tarefa. Carregue as skills aplicáveis conforme a tabela “Skills” do `AGENTS.md` (ex.: `supabase` para migrations, `vercel-react-best-practices` para `src/` React, `impeccable` para mudanças visuais). Se houver ambiguidade real no pedido, pergunte agora — não depois de implementar.
   **Conclua quando:** o comportamento esperado, os arquivos afetados e as rules aplicáveis estiverem claros.

2. **Planejar** — crie `tasks/quick-<slug>/plano.md` seguindo `./references/TEMPLATE_PLANO.md`. O plano é curto: objetivo, arquivos a alterar/criar (conferindo o lugar de cada um em `.agents/rules/folder-structure.md`), passos, testes a escrever ou ajustar e riscos. Não repita o conteúdo das rules — referencie-as.
   **Conclua quando:** o `plano.md` estiver salvo.

3. **Aprovar** — mostre o plano ao usuário (resumo do conteúdo + caminho do arquivo) e **pare**, aguardando aprovação explícita. Não escreva código antes disso. Se ele pedir mudanças, atualize o `plano.md` e mostre de novo.
   **Conclua quando:** o usuário tiver aprovado o plano explicitamente; registre a aprovação no `plano.md` (`Status: APROVADO`).

4. **Implementar** — execute os passos do plano. Toda regra de negócio nova ou alterada em `src/services/` entra com teste no mesmo passo (`.agents/rules/tests.md`); bug corrigido ganha um teste que falha sem a correção. Mudança de schema entra como migration nova em `supabase/migrations/`, validada com `npx supabase db reset` — nunca edite uma migration aplicada nem toque em produção.
   Se a implementação revelar que o plano estava errado ou que o escopo cresceu, pare, atualize o `plano.md` e peça nova aprovação antes de seguir.
   **Conclua quando:** todos os passos do plano estiverem implementados com seus testes.

5. **Testar** — execute os comandos de validação do projeto, nesta ordem, e corrija o que falhar antes de seguir:

   ```bash
   npm run lint
   npm run test:coverage
   npm run build
   ```

   Não invente outros comandos: a tabela “Comandos de validação” do `AGENTS.md` é a lista completa. O piso de 80% mede só `src/services/**` e `src/components/textMarks.ts`.
   Se a mudança for visível na interface, valide o fluxo no navegador com a skill `agent-browser`, subindo o app conforme “Como um agente sobe o app” no `AGENTS.md` (porta livre em `5100–5199`, ou `3000–3099` com `vercel dev`), e registre a porta usada.
   **Conclua quando:** os três comandos passarem e, se houver UI, o fluxo tiver sido conferido no navegador.

6. **Revisar** — revise o diff (`git diff` e arquivos novos) contra as rules, como uma versão leve do `/executar-review`:
   - [ ] `code-standards.md` — tamanho de arquivos e funções, cláusulas de guarda, objetos de parâmetro, constantes nomeadas, nenhum segredo no código
   - [ ] `javascript-typescript.md` — `const` sobre `let`, nunca `var`, sempre `===`, nunca `any`, parâmetros e retornos tipados
   - [ ] `tests.md` — regra de negócio nova ou alterada coberta; bug corrigido com teste de regressão
   - [ ] `folder-structure.md` — arquivos no lugar certo e dependências entre camadas respeitadas
   - [ ] Correção — casos de borda, erros silenciados, estados presos, condições de corrida
   - [ ] Escopo — nada além do que o plano previa

   Corrija os problemas encontrados e rode de novo os comandos do passo 5. O que não for corrigido (fora do escopo ou dependente de decisão do usuário) vai para o resumo como pendência.
   **Conclua quando:** não houver problema bloqueador e a validação tiver sido repetida após as correções.

7. **Resumir** — crie `tasks/quick-<slug>/resumo.md` seguindo `./references/TEMPLATE_RESUMO.md`: o que mudou, arquivos alterados, resultado de cada comando de validação, achados da revisão (corrigidos e pendentes) e próximos passos. Informe ao usuário, em poucas linhas, o resultado e o caminho do resumo.
   **Conclua quando:** o `resumo.md` estiver salvo e o usuário tiver sido informado.

8. **Encerrar o ambiente** — desligue os serviços que esta execução subiu, de forma graciosa, e confirme que as portas foram liberadas. Não encerre processos do usuário ou de outra sessão. Faça essa limpeza também se a execução for interrompida ou bloqueada.
   Não faça commit, push, merge nem deploy sem pedido explícito: veja “O que nenhum agente faz sozinho” e “Commits” no `AGENTS.md`.
