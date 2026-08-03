-- Fase 5 — tabelas de sincronização (decks, cards, review_logs).
--
-- Timestamps de domínio ficam em bigint (epoch ms): o modelo local já trata
-- todos eles como number e faz aritmética direta (c.due <= now, elapsed_days).
-- `synced_at` é a exceção: é o cursor de pull incremental, mantido só pelo
-- servidor via trigger, para não sofrer com relógio de cliente desalinhado
-- (um aparelho adiantado empurraria o cursor para a frente e pararia de
-- puxar qualquer coisa até o outro relógio alcançar).
--
-- PK composta (user_id, id): os ids são gerados no cliente (crypto.randomUUID()),
-- então um cliente pode submeter um id que já existe sob outro usuário. Com
-- PK só em id isso vira violação de unicidade explorável como oráculo de
-- existência entre contas. Com a composta, cada usuário tem namespace
-- isolado e a FK composta torna referência cross-tenant estruturalmente
-- impossível, não apenas bloqueada por policy.

create table public.decks (
  id                  uuid   not null,
  user_id             uuid   not null default auth.uid()
                             references auth.users(id) on delete cascade,
  name                text   not null,
  new_cards_per_day   integer not null default 20 check (new_cards_per_day >= 0),
  young_limit         integer not null default 50 check (young_limit >= 0),
  listen_first        boolean not null default false,
  voice               text   not null default 'nova',
  speech_rate         double precision not null default 1
                             check (speech_rate between 0.5 and 2),
  fsrs_params         double precision[],
  params_optimized_at bigint,
  created_at          bigint not null,
  updated_at          bigint not null,
  deleted_at          bigint not null default 0,   -- 0 = vivo, nunca null
  synced_at           timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.cards (
  id             uuid   not null,
  user_id        uuid   not null default auth.uid()
                        references auth.users(id) on delete cascade,
  deck_id        uuid   not null,
  sentence       text   not null,
  translation    text   not null default '',
  hints          jsonb  not null default '[]'::jsonb,
  cloze_ranges   jsonb,
  due            bigint not null,
  stability      double precision not null,
  difficulty     double precision not null,
  elapsed_days   double precision not null,
  scheduled_days double precision not null,
  reps           integer not null,
  lapses         integer not null,
  state          smallint not null check (state between 0 and 3),
  last_review    bigint,
  created_at     bigint not null,
  updated_at     bigint not null,
  deleted_at     bigint not null default 0,
  synced_at      timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);

-- Imutáveis: sem updated_at (nenhuma edição é esperada) e sem deleted_at
-- (nunca são apagados, nem quando o card é — heatmap e streak devem
-- continuar contando o estudo que de fato aconteceu).
create table public.review_logs (
  id             uuid   not null,
  user_id        uuid   not null default auth.uid()
                        references auth.users(id) on delete cascade,
  card_id        uuid   not null,
  deck_id        uuid   not null,
  rating         text   not null check (rating in ('again','good')),
  reviewed_at    bigint not null,
  state_before   smallint not null check (state_before between 0 and 3),
  scheduled_days double precision not null,
  duration_ms    integer not null,
  synced_at      timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  foreign key (user_id, card_id)
    references public.cards (user_id, id) on delete cascade,
  foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);

-- Cursor de pull incremental (user_id, synced_at) em cada tabela; sem eles
-- toda página de pull seria um seq scan. (user_id, deck_id) e
-- (user_id, card_id) sustentam as FKs compostas acima.
create index decks_pull_idx       on public.decks       (user_id, synced_at);
create index cards_pull_idx       on public.cards       (user_id, synced_at);
create index review_logs_pull_idx on public.review_logs (user_id, synced_at);
create index cards_deck_idx       on public.cards       (user_id, deck_id);
create index review_logs_card_idx on public.review_logs (user_id, card_id);
create index review_logs_deck_idx on public.review_logs (user_id, deck_id);

-- clock_timestamp(), não now(): now() é o instante de início da transação,
-- então um bulk insert de milhares de cards (import do Anki) daria o mesmo
-- synced_at para todas as linhas e quebraria o desempate da paginação
-- keyset numa borda de página.
create or replace function public.touch_synced_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger decks_touch_synced_at       before insert or update on public.decks
  for each row execute function public.touch_synced_at();
create trigger cards_touch_synced_at       before insert or update on public.cards
  for each row execute function public.touch_synced_at();
create trigger review_logs_touch_synced_at before insert on public.review_logs
  for each row execute function public.touch_synced_at();
