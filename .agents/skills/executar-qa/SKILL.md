---
name: executar-qa
description: "QA — valide e estabilize uma funcionalidade implementada contra o PRD, a TechSpec e as tarefas: testes de unidade, de integração e E2E com a skill agent-browser, acessibilidade, responsividade, correção dos bugs encontrados e um relatório final com evidências. Use quando o usuário pedir para executar QA. Não use para implementar novas tarefas nem para revisar o código (executar-review)."
argument-hint: --prd nome-da-funcionalidade
---

O argumento `--prd` identifica o slug da funcionalidade. Sem argumento, localize a pasta em `./tasks/prd-*/`. Leia o `AGENTS.md` do projeto. Em `tasks/prd-[slug]/`, leia `prd.md`, `techspec.md` e `tasks.md`; gere e mantenha o `qa.md` com os defeitos, as correções, os testes de regressão e as evidências. Salve todas as evidências da ferramenta de navegador em `tasks/prd-[slug]/evidences/`.

O QA só estará **APROVADO** quando todos os critérios de aceitação do PRD tiverem sido verificados e estiverem atendidos. Se encontrar bugs, corrija-os na causa raiz, crie testes de regressão e repita a validação.

Para os fluxos de interface, use a skill **`agent-browser`** — é a ferramenta de navegador deste projeto. **Não há Playwright instalado nem pasta `e2e/`**: os casos `E2E-*` da TechSpec são executados à mão pelo navegador, com captura de tela como evidência. Não rode `npx playwright` nem crie `e2e/*.spec.ts` sem alinhar antes com o usuário.

O app é offline-first: boa parte dos critérios se valida com `npm run dev` puro, sem chave nenhuma. Só suba `npx vercel dev` quando o critério envolver tradução automática, voz neural ou sync, e só suba `npx supabase start` quando envolver conta e sincronização. Sem as chaves, `api/` responde `501` e o app cai no fallback local — isso é comportamento esperado, não bug.

## Fluxo

1. **Analisar** — leia o `AGENTS.md`, todas as rules em `.agents/rules/`, o PRD, a TechSpec e cada arquivo de tarefa; monte um checklist com um item de verificação por critério de aceitação (`CA-*`) e associe os casos de teste correspondentes (`TU-*`, `TI-*` e `E2E-*`).
   **Conclua quando:** houver um item de verificação e pelo menos um caso de teste associado a cada critério de aceitação do PRD.

2. **Preparar o ambiente** — suba **só** os serviços que os critérios exigem, seguindo “Como um agente sobe o app” no `AGENTS.md`: `npm run dev -- --port <5100–5199>`, `npx vercel dev --listen <3000–3099>` quando precisar de `api/`, e `npx supabase start` (portas fixas `54321–54327`, não realocáveis) quando precisar de conta e sync. Verifique a porta antes de subir, registre porta e processo e abra a aplicação com a skill `agent-browser`.
   Com Supabase local, crie um usuário de teste próprio — a conta real não existe nesse banco — e pegue o e-mail de confirmação no Inbucket (`http://localhost:54324`), não numa caixa de entrada real. O IndexedDB é isolado por origem, então cada porta tem seu próprio banco local.
   **Conclua quando:** os serviços necessários responderem, a página inicial estiver carregada e as URLs e portas usadas estiverem registradas.

3. **Testar cada fluxo (E2E)** — para cada critério de aceitação com fluxo de interface, execute o caso E2E correspondente com a skill `agent-browser` e verifique o resultado esperado no estado da aplicação. Quando houver comportamento inesperado, investigue o estado da interface, o console do navegador (`agent-browser console`), as requisições e respostas (`agent-browser network`) e a saída do processo do `vercel dev` antes de registrar ou corrigir o bug. Capture uma evidência visual (`agent-browser screenshot`), salve-a em `tasks/prd-[slug]/evidences/`, marque o resultado como PASSOU ou FALHOU e registre cada falha no `qa.md`.
   Este app guarda dados no IndexedDB: para os cenários de estado vazio, limpe o banco do navegador antes do fluxo em vez de assumir que a tela está zerada.

   **Conclua quando:** todo critério de aceitação com fluxo de interface estiver marcado como PASSOU ou FALHOU, com evidência.

4. **Executar casos de teste da TechSpec** — rode `npm run lint`, `npm run test:coverage` e `npm run build`, e associe os casos `TU-*`/`TI-*` aos critérios de aceitação. Registre a cobertura no `qa.md`: o piso de 80% mede só `src/services/**` e `src/components/textMarks.ts`; `src/screens/`, `src/components/*.tsx` e `src/contexts/` estão fora do gate por decisão do projeto e são validados pelos passos 3, 5 e 6 — não registre isso como falha de cobertura.
   **Conclua quando:** os três comandos tiverem rodado e todos os casos `TU-*`/`TI-*` associados aos critérios tiverem sido executados ou estiverem explicitamente bloqueados.

5. **Verificar acessibilidade** — em cada tela, use `agent-browser` para testar a navegação por teclado e verificar rótulos e semântica:
   - [ ] Navegação por teclado (Tab, Enter, Esc)
   - [ ] Elementos interativos com rótulos descritivos
   - [ ] Imagens com texto alternativo (`alt`) apropriado
   - [ ] Contraste de cores adequado
   - [ ] Formulários com rótulos associados aos campos
   - [ ] Mensagens de erro claras e acessíveis
   - [ ] Fontes com tamanho apropriado

   **Conclua quando:** cada item tiver sido verificado em cada tela.

6. **Verificar visual e responsividade** — capture as telas principais, salve-as em `tasks/prd-[slug]/evidences/`, cubra os estados (vazio, com dados e erro) e documente as inconsistências. O Lingo é um PWA instalável e mobile-first: valide sempre em uma largura de celular (≈390px, onde o `MobileNav` aparece) **e** em desktop (≈1280px). Para questões de design visual além do funcional, use a skill `impeccable`.
   **Conclua quando:** os principais estados estiverem capturados nas duas larguras e as inconsistências, documentadas.

7. **Corrigir os bugs encontrados** — para cada bug registrado no `qa.md`:
   - localize e corrija a causa raiz, sem mascarar o sintoma;
   - crie um teste de regressão que falhe sem a correção;
   - registre no `qa.md` o status, a correção aplicada e o teste criado;
   - se a correção exigir alteração do PRD, da TechSpec ou do escopo, pare e solicite uma decisão ao usuário.

   **Conclua quando:** cada bug registrado no `qa.md` tiver uma correção e um teste de regressão, ou estiver explicitamente bloqueado por uma decisão do usuário.

8. **Revalidar** — repita os fluxos que falharam, execute os testes de regressão e verifique novamente os critérios de aceitação afetados. Se alguma validação falhar, volte ao passo 7.
   **Conclua quando:** todos os critérios de aceitação estiverem marcados como PASSOU, sem bugs não resolvidos.

9. **Reportar** — gere o `qa.md` seguindo `./references/TEMPLATE.md` desta skill, incluindo os bugs corrigidos, os testes de regressão e as evidências finais.
   **Conclua quando:** o `qa.md` estiver gerado conforme o template e atualizado com os resultados finais.

10. **Encerrar o ambiente** — desligue todos os serviços iniciados por esta execução (`npx supabase stop` só se foi você quem o subiu, e nunca com `--no-backup`), feche o navegador (`agent-browser close`), encerre os processos de forma graciosa e confirme que as portas e containers foram liberados. Não encerre processos do usuário ou de outra sessão. Faça essa limpeza também se o QA for interrompido, bloqueado ou reprovado.
