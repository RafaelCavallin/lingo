---
name: executar-review
description: Revisão de código — revise e estabilize o código de uma funcionalidade quanto à conformidade com as regras do projeto, à aderência à TechSpec e às tarefas e aos testes, com relatório final e veredito. Use quando o usuário pedir para revisar código, executar uma revisão de código, validar a conformidade com as regras ou corrigir problemas encontrados durante a revisão. Não use para validar o comportamento em QA (executar-qa) nem para implementar novas tarefas.
argument-hint: --prd nome-da-funcionalidade
---

O argumento `--prd` identifica o slug da funcionalidade. Sem argumento, localize a pasta em `./tasks/prd-*/`. Leia o `AGENTS.md` do projeto. Em `tasks/prd-[slug]/`, leia `techspec.md` e `tasks.md`; consulte `prd.md` somente quando necessário para esclarecer um requisito. Gere o `codereview.md` na mesma pasta.

Confira as regras do projeto e a TechSpec antes de apontar qualquer problema. Execute os testes e as validações exigidos no `AGENTS.md` antes de registrar o veredito; a revisão só poderá ser **APROVADA** quando todos os testes aplicáveis passarem.

## Fluxo

1. **Analisar** — leia o `AGENTS.md`, todas as rules em `.agents/rules/`, a TechSpec (arquitetura esperada) e as tarefas (escopo implementado). Carregue as skills aplicáveis conforme a tabela “Skills” do `AGENTS.md`.
   **Conclua quando:** a arquitetura esperada, o escopo, as rules e as skills aplicáveis estiverem claros.

2. **Conformidade com as regras** — confira cada mudança contra as regras aplicáveis do projeto em `.agents/rules/`. Registre cada violação e a regra correspondente. Neste projeto, confira sempre:
   - [ ] `code-standards.md` — tamanho de arquivos e funções, cláusulas de guarda, objetos de parâmetro, constantes nomeadas, nenhum segredo no código
   - [ ] `javascript-typescript.md` — `const` sobre `let`, nunca `var`, sempre `===`, **nunca `any`**, parâmetros e retornos tipados
   - [ ] `tests.md` — toda regra de negócio nova ou alterada entrou com teste; bug corrigido tem teste que falha sem a correção
   - [ ] `folder-structure.md` — cada arquivo novo no lugar certo e as regras de dependência entre camadas respeitadas: `src/services/` sem React nem import de `screens/`/`components/`/`contexts/`; `screens/`/`components/` acessando dados só via `services/`; `components/` sem importar de `screens/`; `src/test/` só importado por testes; nada em `src/` importando de `api/`
   - [ ] `api/` no Edge Runtime — sem APIs do Node (`fs`, `process.cwd`, `Buffer`); rota sem chave responde `501`, e isso é esperado
   - [ ] `supabase/migrations/` — mudança de schema como migration nova, nunca editando uma já aplicada

   **Conclua quando:** cada mudança tiver sido conferida contra as regras aplicáveis.

3. **Aderência à TechSpec** — compare a implementação com o especificado:
   - [ ] Arquitetura conforme especificado
   - [ ] Componentes, interfaces e contratos conforme definidos
   - [ ] Modelos de dados conforme documentados
   - [ ] Endpoints/APIs e integrações, quando aplicáveis, conforme especificados

   **Conclua quando:** cada decisão da TechSpec tiver sido confirmada como implementada ou registrada como desvio justificado.

4. **Completude das tarefas** — para cada tarefa marcada como completa, verifique se o código foi implementado, os critérios de aceitação relacionados estão rastreados, as subtarefas foram concluídas e os testes da tarefa estão presentes. A validação funcional dos critérios continua sendo responsabilidade do QA.
   **Conclua quando:** cada tarefa marcada como completa atender aos quatro pontos.

5. **Testes** — execute os três comandos de validação do projeto, nesta ordem, e registre a saída de cada um:

   ```bash
   npm run lint
   npm run test:coverage
   npm run build
   ```

   Não invente outros comandos: a tabela “Comandos de validação” do `AGENTS.md` é a lista completa. O piso de 80% mede só `src/services/**` e `src/components/textMarks.ts` — **não** aponte falta de cobertura em `src/screens/`, `src/components/*.tsx` ou `src/contexts/`, que estão fora do gate por decisão do projeto. Casos `E2E-*` não são executados aqui; ficam para o `/executar-qa`.
   Se alguma verificação exigir a aplicação no ar, suba-a como descrito em “Como um agente sobe o app” no `AGENTS.md` e registre a porta usada.
   **Conclua quando:** os três comandos tiverem sido executados, com testes passando e a cobertura no piso.

6. **Corrigir e revalidar** — para cada problema encontrado:
   - corrija a causa raiz e ajuste ou crie os testes necessários;
   - se a correção exigir alteração do PRD, da TechSpec ou do escopo, registre o problema como bloqueador e solicite uma decisão ao usuário;
   - execute novamente os testes e repita as verificações relevantes.

   **Conclua quando:** não houver problemas bloqueadores e os testes e as verificações relevantes tiverem sido executados novamente.

7. **Reportar** — gere o `codereview.md` seguindo `./references/TEMPLATE.md` desta skill, com o veredito:
   - **APROVADO** — critérios atendidos, testes passando, código conforme as regras e a TechSpec.
   - **APROVADO COM RESSALVAS** — principais critérios atendidos; melhorias recomendadas, mas não bloqueantes.
   - **REPROVADO** — testes falhando, violação grave de padrão, falta de aderência à TechSpec ou problema de segurança.

   **Conclua quando:** o `codereview.md` estiver salvo conforme o template, com o veredito registrado.

8. **Encerrar o ambiente** — desligue todos os serviços iniciados por esta execução, encerre os processos de forma graciosa e confirme que as portas e containers foram liberados. Não encerre processos do usuário ou de outra sessão, e não derrube um Supabase local que você não subiu. Faça essa limpeza também se a revisão for interrompida, bloqueada ou reprovada.
