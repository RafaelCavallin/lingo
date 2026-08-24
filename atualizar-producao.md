# Atualizar produção

Roteiro manual para levar o que está na `des` para produção. **Nada aqui roda sozinho**: não há promoção automática, nenhum push dispara este processo e nenhum agente deve executá-lo sem pedido explícito.

A regra que sustenta o roteiro: **só sobe para produção o que já foi validado 100% no preview da `des`**. O contexto de ambientes, bancos e branches está em [AGENTS.md](AGENTS.md) — leia a seção "Isolamento entre desenvolvimento e produção" antes da primeira vez.

| | |
| --- | --- |
| Branch de produção | `prod` (a `main` **não** deploya) |
| URL de produção | `https://lingo-mu-nine.vercel.app` (público, sem login) |
| Banco de produção | Supabase `supabase-gray-compass` (`uglvzvfgrnzoyfeotter`) |
| Credenciais | Vercel, escopo Production; cópia local em `.env.vercel-prod.bak` (fora do git) |

---

## 1. Validar na `des`

Nenhum passo seguinte começa antes daqui. Tudo o que for para produção já passou por:

```bash
npm run lint            # 0 erros
npm run build           # type-check + build de produção
npm run test:coverage   # testes + piso de 80% de cobertura
```

Os três são o mesmo trio do CI (`.github/workflows/ci.yml`) — confirme também que o workflow ficou verde no push da `des`.

Como cobertura não mede telas, a validação de UI é manual, **no preview da `des`** (`https://lingo-git-des-rafaelcavallin89-3287s-projects.vercel.app`, exige login na Vercel), não só no `npm run dev`:

- [ ] A funcionalidade nova faz o que deveria, com um usuário de teste do `lingo-dev`.
- [ ] O que já existia continua funcionando — revisar cartão, criar, editar, importar, sincronizar.
- [ ] Se mexeu em sync: entrar em dois dispositivos/abas, alterar nos dois e conferir que nada some.
- [ ] Sem erro no console do navegador.

Se qualquer item falhar, o processo para aqui.

## 2. Aplicar as migrations pendentes em produção

**Antes** do deploy, nunca depois. As migrations deste projeto são aditivas e retrocompatíveis (colunas nullable, `create or replace` de função com a mesma assinatura), então o frontend que está no ar continua funcionando com o schema novo. Na ordem inversa existe uma janela em que dados novos são descartados no sync sem erro nenhum.

Primeiro veja o que está pendente, sem escrever nada:

```bash
npx supabase migration list --db-url "$(grep '^POSTGRES_URL_NON_POOLING=' .env.vercel-prod.bak | cut -d= -f2- | tr -d '"')"
```

Se a lista bater com o esperado, aplique:

```bash
npx supabase db push --db-url "$(grep '^POSTGRES_URL_NON_POOLING=' .env.vercel-prod.bak | cut -d= -f2- | tr -d '"')"
```

Pontos de atenção:

- **Sempre `--db-url` explícito.** O `supabase link` deste repositório aponta para produção, então um `db push --linked` distraído escreve no banco real achando que está em outro lugar.
- Use `POSTGRES_URL_NON_POOLING` (conexão direta), não a versão com pooler.
- O `db push` aplica **tudo** que estiver pendente, não só a migration da vez — por isso o `migration list` antes.
- Não cole o SQL no SQL Editor do dashboard: o schema até sai igual, mas a migration não fica registrada no histórico e o CLI passa a achar que continua pendente.
- Se o `.env.vercel-prod.bak` estiver velho (host diferente de `db.uglvzvfgrnzoyfeotter.supabase.co`), repuxe com `npx vercel env pull .env.vercel-prod.bak` — **nunca** `vercel env pull` sem argumento, que sobrescreve o `.env.local` e fura o isolamento.

Sem migration nova, pule para o passo 3.

## 3. Promover `des` → `prod`

```bash
git checkout prod
git pull origin prod
git merge des
git push origin prod
```

O push na `prod` é o que dispara o deploy de produção na Vercel. Volte para a `des` depois (`git checkout des`) para não seguir trabalhando na branch de produção.

## 4. Acompanhar o deploy

No dashboard da Vercel, o deploy da `prod` deve terminar com "Ready". Ele roda `npm run build`, então erro de tipo derruba o deploy — e produção continua na versão anterior, que é o comportamento desejado.

## 5. Conferir em produção

Em `https://lingo-mu-nine.vercel.app`, com a conta real:

- [ ] O app carrega e a funcionalidade nova aparece.
- [ ] Login e sincronização funcionam (é o banco de produção, não o `lingo-dev`).
- [ ] Sem erro no console.

Por ser PWA, o service worker pode servir a versão antiga por alguns minutos; um hard refresh resolve na hora.

## Se der errado

- **Frontend**: no dashboard da Vercel, "Instant Rollback" no deploy anterior — volta em segundos, sem tocar no banco.
- **Banco**: as migrations são aditivas, então o frontend antigo convive com o schema novo — não desfaça a migration. Reverter coluna em produção só faz sentido com dado corrompido, e aí é caso a caso.
- Corrija na `des`, valide de novo desde o passo 1 e promova outra vez. Não corrija direto na `prod`.
