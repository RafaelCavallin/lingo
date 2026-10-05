# Cenário: <título curto>

- **Alvo:** local | dev (`lingo-dev`)
- **Conta:** `<nome>@lingo.test` / senha `<senha>`
- **Criado em:** <AAAA-MM-DD>
- **Serve para:** <o que este cenário permite testar: tela, fluxo ou regra>

## Estado esperado

<O que a conta tem depois de `aplicar.sql`, em linguagem de produto. Ex.: "um deck 'Inglês — viagem' com 3 cartões: 1 novo, 1 em revisão vencido ontem, 1 reaprendendo; 1 revisão no histórico há 11 dias.">

| Deck | Vivos | Excluídos | Novos | Vencidos | Revisões |
| --- | --- | --- | --- | --- | --- |
| <colar a saída de `pg_temp.resumo`> | | | | | |

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `aplicar.sql` | cria a conta e os registros (idempotente: rodar de novo recria do zero) |
| `alterar.sql` | <se houver: as edições/exclusões que o teste pede, aplicadas depois> |
| `desfazer.sql` | apaga a conta e tudo dela |

```bash
.agents/skills/criar-cenario-teste/scripts/sql.sh <alvo> tasks/cenario-<slug>/aplicar.sql
```

## Como ver no app

<Ex.: subir com `npm run dev -- --port <porta>`, entrar com a conta acima numa sessão limpa do navegador; o sync do login traz os dados. Já logado: Ajustes → Sincronizar agora, ou recarregar a página.>

## Origem dos textos

<De onde vieram frase/tradução/dicas: catálogo `references/frases.md` (F01, F02…), textos do usuário ou placeholders. Nenhum texto gerado por IA.>
