-- Fase 5 — RLS e grants para decks, cards, review_logs.
--
-- Tabelas não são mais auto-expostas à Data API (breaking change 2026-04-28,
-- obrigatório para todos os projetos a partir de 2026-10-30): grants
-- explícitos são necessários mesmo com RLS habilitada.

alter table public.decks       enable row level security;
alter table public.cards       enable row level security;
alter table public.review_logs enable row level security;

grant usage on schema public to authenticated;

-- Nenhum delete em lugar nenhum: soft delete deixa de ser convenção e vira a
-- única coisa que os grants permitem. review_logs não recebe update: são
-- imutáveis por desenho. Nada é concedido a anon — não há leitura pública.
grant select, insert, update on public.decks       to authenticated;
grant select, insert, update on public.cards       to authenticated;
grant select, insert         on public.review_logs to authenticated;

revoke all on public.decks       from anon;
revoke all on public.cards       from anon;
revoke all on public.review_logs from anon;

-- ---------- decks ----------
create policy "decks_select_own" on public.decks
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "decks_insert_own" on public.decks
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

-- UPDATE precisa de USING (quais linhas pode tocar) e WITH CHECK (para que
-- valor pode mudar) — sem o WITH CHECK, o cliente reatribui user_id e
-- entrega a linha para outra conta.
create policy "decks_update_own" on public.decks
  for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- ---------- cards ----------
create policy "cards_select_own" on public.cards
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "cards_insert_own" on public.cards
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "cards_update_own" on public.cards
  for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- ---------- review_logs (somente inserção, união por id) ----------
create policy "review_logs_select_own" on public.review_logs
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "review_logs_insert_own" on public.review_logs
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );
-- Sem policy nem grant de update/delete: imutabilidade garantida pelo banco,
-- não por convenção de código.
