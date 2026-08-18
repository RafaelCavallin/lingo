-- Campo de transcrição fonética do cartão (ex.: ˈbərd(ə)n).
--
-- Nullable como cloze_ranges: a maioria dos cartões antigos não tem fonética e
-- null distingue "não preenchido" de string vazia sem custo nenhum.
alter table public.cards add column if not exists phonetic text;

-- O sync_push precisa ser reemitido inteiro: jsonb_populate_recordset já lê a
-- coluna nova do payload, mas a lista de colunas do insert e o do-update são
-- explícitos — sem os dois, a fonética seria descartada em silêncio a cada push.
--
-- Único delta em relação a 20260802220453_sync_push.sql: `phonetic` no bloco de
-- cards (lista do insert, select e on conflict).
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
      id, user_id, deck_id, sentence, translation, phonetic, hints, cloze_ranges,
      due, stability, difficulty, elapsed_days, scheduled_days,
      reps, lapses, state, last_review, created_at, updated_at, deleted_at)
    select s.id, v_uid, s.deck_id, s.sentence, s.translation, s.phonetic, s.hints, s.cloze_ranges,
           s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
           s.reps, s.lapses, s.state, s.last_review,
           s.created_at, least(s.updated_at, v_max), s.deleted_at
    from src s
    on conflict (user_id, id) do update set
      deck_id = excluded.deck_id, sentence = excluded.sentence,
      translation = excluded.translation, phonetic = excluded.phonetic,
      hints = excluded.hints,
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

revoke all on function public.sync_push(jsonb, jsonb, jsonb) from public;
grant execute on function public.sync_push(jsonb, jsonb, jsonb) to authenticated;
