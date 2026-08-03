-- Fase 5 — RPC transacional de push do sync.
--
-- Por que RPC em vez de três .upsert() do PostgREST: o .upsert() compila
-- para "on conflict do update" SEM where — é clobber cego, uma linha velha
-- sobrescreve a mais nova de outro aparelho. E não dá para envolver
-- decks+cards+logs numa transação só, então uma falha no meio deixa cards
-- órfãos de deck. Esta função resolve os dois problemas: cada upsert só
-- vence "where excluded.updated_at > t.updated_at" (LWW de verdade, no
-- servidor) e a ordem decks → cards → logs corre numa transação única.
--
-- SECURITY INVOKER: a função roda com os privilégios de quem chama, então a
-- RLS continua valendo — isto não é bypass, é só SQL que o PostgREST não
-- consegue expressar sozinho.
create or replace function public.sync_push(
  p_decks jsonb default '[]'::jsonb,
  p_cards jsonb default '[]'::jsonb,
  p_logs  jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid   := (select auth.uid());
  -- Clamp de relógio de cliente adiantado: limita o estrago de um aparelho
  -- com o relógio errado a uma hora de vantagem em vez de "para sempre".
  -- Não clampar `due` — é estado do FSRS, não timestamp de auditoria.
  v_max  bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint + 3600000;
  v_d int := 0; v_c int := 0; v_l int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  with src as (
    select * from jsonb_populate_recordset(null::public.decks, p_decks)
  ), up as (
    insert into public.decks as t (
      id, user_id, name, new_cards_per_day, young_limit, listen_first,
      voice, speech_rate, fsrs_params, params_optimized_at,
      created_at, updated_at, deleted_at)
    select s.id, v_uid, s.name, s.new_cards_per_day, s.young_limit, s.listen_first,
           s.voice, s.speech_rate, s.fsrs_params, s.params_optimized_at,
           s.created_at, least(s.updated_at, v_max), s.deleted_at
    from src s
    on conflict (user_id, id) do update set
      name = excluded.name,
      new_cards_per_day = excluded.new_cards_per_day,
      young_limit = excluded.young_limit,
      listen_first = excluded.listen_first,
      voice = excluded.voice,
      speech_rate = excluded.speech_rate,
      fsrs_params = excluded.fsrs_params,
      params_optimized_at = excluded.params_optimized_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    where excluded.updated_at > t.updated_at
    returning 1
  ) select count(*) into v_d from up;

  with src as (
    select * from jsonb_populate_recordset(null::public.cards, p_cards)
  ), up as (
    insert into public.cards as t (
      id, user_id, deck_id, sentence, translation, hints, cloze_ranges,
      due, stability, difficulty, elapsed_days, scheduled_days,
      reps, lapses, state, last_review, created_at, updated_at, deleted_at)
    select s.id, v_uid, s.deck_id, s.sentence, s.translation, s.hints, s.cloze_ranges,
           s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
           s.reps, s.lapses, s.state, s.last_review,
           s.created_at, least(s.updated_at, v_max), s.deleted_at
    from src s
    on conflict (user_id, id) do update set
      deck_id = excluded.deck_id, sentence = excluded.sentence,
      translation = excluded.translation, hints = excluded.hints,
      cloze_ranges = excluded.cloze_ranges, due = excluded.due,
      stability = excluded.stability, difficulty = excluded.difficulty,
      elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
      reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
      last_review = excluded.last_review, updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    where excluded.updated_at > t.updated_at
    returning 1
  ) select count(*) into v_c from up;

  with src as (
    select * from jsonb_populate_recordset(null::public.review_logs, p_logs)
  ), up as (
    insert into public.review_logs (
      id, user_id, card_id, deck_id, rating, reviewed_at,
      state_before, scheduled_days, duration_ms)
    select s.id, v_uid, s.card_id, s.deck_id, s.rating, s.reviewed_at,
           s.state_before, s.scheduled_days, s.duration_ms
    from src s
    on conflict (user_id, id) do nothing   -- imutável: união por id
    returning 1
  ) select count(*) into v_l from up;

  return jsonb_build_object('decks', v_d, 'cards', v_c, 'logs', v_l);
end;
$$;

-- O Postgres concede EXECUTE a PUBLIC em toda função nova por padrão; sem o
-- revoke, esta RPC seria chamável por anon.
revoke all on function public.sync_push(jsonb, jsonb, jsonb) from public;
grant execute on function public.sync_push(jsonb, jsonb, jsonb) to authenticated;
