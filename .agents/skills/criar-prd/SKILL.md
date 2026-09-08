---
name: criar-prd
description: PRD — Documento de Requisitos de Produto. Use quando o usuário pedir um PRD ou quiser definir os requisitos e o escopo de uma nova funcionalidade ou produto (primeira etapa do fluxo PRD → TechSpec → tasks). Não use para especificações técnicas (criar-techspec) nem para decompor requisitos em tarefas (criar-tasks).
argument-hint: --prompt "descrição da funcionalidade"
---

O PRD define o problema, os objetivos, os resultados esperados, as restrições e o escopo. Objetivos e resultados devem ter critérios mensuráveis. Os detalhes de implementação — como arquitetura e código — pertencem à TechSpec e ficam fora do PRD.

Antes de perguntar qualquer coisa, leia o [README.md](../../../README.md) para a visão de produto. O Lingo é um app pessoal de estudo de idiomas por repetição espaçada: PWA instalável, **offline-first** (todos os dados no IndexedDB via Dexie), mobile-first, e com conta/sincronização, tradução automática e voz neural como camadas **opcionais** — sem nenhuma chave de API o app funciona por completo. Todo requisito novo herda isso: descreva o comportamento sem rede e sem conta antes de descrever o caminho feliz online, e trate degradação como requisito, não como erro.

## Fluxo de trabalho

1. **Esclarecer** — faça perguntas ao usuário usando `AskUserQuestion` antes de redigir:
   - Problema a ser resolvido e metas mensuráveis
   - Usuários principais, histórias de usuário e fluxos principais
   - Funcionalidades centrais: entradas, saídas e ações
   - Itens fora do escopo e dependências
   - Diretrizes de UI/UX e acessibilidade
   - Comportamento offline e sem conta, e o que degrada quando falta chave de API ou rede

   Para regras de negócio específicas do domínio, pesquise na web em vez de perguntar ao usuário.
   **Conclua quando:** cada seção do template tiver uma resposta ou premissa registrada.

2. **Redigir** — leia `./references/TEMPLATE.md` desta skill na íntegra e siga sua estrutura exatamente.
   **Conclua quando:** toda seção do template estiver preenchida com informações específicas da funcionalidade ou do produto.

3. **Salvar e reportar** — grave o documento em `./tasks/prd-[slug]/prd.md`, usando um slug da funcionalidade em kebab-case. Informe o caminho com um resumo de uma linha.
