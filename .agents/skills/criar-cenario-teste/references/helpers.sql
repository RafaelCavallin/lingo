-- Helpers da skill criar-cenario-teste. Carregados pelo scripts/sql.sh antes de
-- cada execução, na mesma transação do cenário. Tudo em pg_temp: nada disto
-- fica no banco depois que a sessão termina.
--
-- Regras que estes helpers garantem (não as contorne com SQL solto):
--   * só usuários com e-mail @lingo.test são tocados;
--   * toda escrita de domínio grava updated_at = agora (o pull do app usa LWW
--     por updated_at e ignora o que não for mais novo que a cópia local);
--   * exclusão é soft delete (deleted_at = updated_at = agora): um DELETE
--     físico nunca chega ao IndexedDB de quem já sincronizou;
--   * texto (frase, tradução, fonética, dicas) entra sempre literal, escrito
--     no cenário. Nada aqui chama /api/enrich ou qualquer IA.

set local client_min_messages = warning;

-- ---------- tempo (epoch ms, igual ao modelo do app) ----------

create function pg_temp.agora_ms() returns bigint
language sql volatile as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- Instante relativo a agora: pg_temp.ms('-2 days'), pg_temp.ms('3 hours').
create function pg_temp.ms(p_delta interval) returns bigint
language sql volatile as $$
  select (extract(epoch from clock_timestamp() + p_delta) * 1000)::bigint
$$;

-- ---------- usuários ----------

create function pg_temp.exigir_email_teste(p_email text) returns void
language plpgsql as $$
begin
  if p_email is null or p_email not like '%@lingo.test' then
    raise exception 'só contas @lingo.test podem ser usadas em cenários (recebido: %)', p_email;
  end if;
end $$;

-- Id do usuário de teste; falha se não existir.
create function pg_temp.uid(p_email text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.exigir_email_teste(p_email);
  select id into v_id from auth.users where email = p_email;
  if v_id is null then
    raise exception 'usuário de teste % não existe — crie com pg_temp.usuario_teste()', p_email;
  end if;
  return v_id;
end $$;

-- Cria um usuário já confirmado (login com e-mail e senha funciona na hora,
-- sem passar pelo Inbucket). Idempotente: se o e-mail já existe, devolve o id.
create function pg_temp.usuario_teste(p_email text, p_senha text default 'senha-teste-123')
returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.exigir_email_teste(p_email);
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid();
  -- Os tokens vazios ('') não são enfeite: o GoTrue falha ao ler NULL nessas colunas.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
  return v_id;
end $$;

-- Remove o usuário de teste e, em cascata, todos os decks, cards e logs dele.
-- É limpeza de cenário, não "exclusão" do ponto de vista do app: o navegador
-- que já sincronizou continua com a cópia local (use sessão limpa).
create function pg_temp.apagar_usuario_teste(p_email text) returns void
language plpgsql as $$
begin
  perform pg_temp.exigir_email_teste(p_email);
  delete from auth.users where email = p_email;
end $$;

-- ---------- decks ----------

create function pg_temp.criar_deck(
  p_email             text,
  p_nome              text,
  p_novos_por_dia     integer default 20,
  p_limite_jovens     integer default 50,
  p_ouvir_primeiro    boolean default false,
  p_voz               text    default 'nova',
  p_velocidade        double precision default 1,
  p_criado            interval default '0'
) returns uuid
language plpgsql as $$
declare
  v_id  uuid := gen_random_uuid();
  v_ts  bigint := pg_temp.ms(p_criado);
begin
  insert into public.decks (
    id, user_id, name, new_cards_per_day, young_limit, listen_first,
    voice, speech_rate, created_at, updated_at)
  values (
    v_id, pg_temp.uid(p_email), p_nome, p_novos_por_dia, p_limite_jovens, p_ouvir_primeiro,
    p_voz, p_velocidade, v_ts, greatest(v_ts, pg_temp.agora_ms()));
  return v_id;
end $$;

-- Deck vivo do usuário pelo nome; falha se não houver exatamente um.
create function pg_temp.deck(p_email text, p_nome text) returns uuid
language plpgsql as $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.decks
  where user_id = pg_temp.uid(p_email) and name = p_nome and deleted_at = 0;
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    raise exception 'esperava 1 deck vivo "%" de %, achei %', p_nome, p_email, coalesce(array_length(v_ids, 1), 0);
  end if;
  return v_ids[1];
end $$;

-- Exclui (soft delete) o deck e todos os cards vivos dele, como o app faz.
create function pg_temp.excluir_deck(p_email text, p_deck uuid) returns void
language plpgsql as $$
declare v_now bigint := pg_temp.agora_ms(); v_uid uuid := pg_temp.uid(p_email);
begin
  update public.decks set deleted_at = v_now, updated_at = v_now
  where user_id = v_uid and id = p_deck and deleted_at = 0;
  if not found then raise exception 'deck % não encontrado (ou já excluído) em %', p_deck, p_email; end if;
  update public.cards set deleted_at = v_now, updated_at = v_now
  where user_id = v_uid and deck_id = p_deck and deleted_at = 0;
end $$;

-- ---------- cards ----------

-- Faixa [{start, end}] de cada trecho dentro do texto, no formato de
-- cloze_ranges/emphasis_ranges (end exclusivo, como String.slice). Calcula pela
-- primeira ocorrência de cada trecho — contar offsets à mão erra fácil.
--   pg_temp.trecho('Could you call me a taxi?', 'taxi')            → [{"start":20,"end":24}]
--   pg_temp.trecho('Could you call me a taxi?', 'call', 'taxi')    → duas faixas
create function pg_temp.trecho(p_texto text, variadic p_trechos text[]) returns jsonb
language plpgsql as $$
declare v_out jsonb := '[]'; v_t text; v_pos int;
begin
  foreach v_t in array p_trechos loop
    v_pos := position(v_t in p_texto);
    if v_pos = 0 then raise exception 'trecho "%" não aparece em "%"', v_t, p_texto; end if;
    v_out := v_out || jsonb_build_object('start', v_pos - 1, 'end', v_pos - 1 + length(v_t));
  end loop;
  return (select jsonb_agg(r order by (r->>'start')::int) from jsonb_array_elements(v_out) r);
end $$;

-- Estados prontos do FSRS (state 0..3). Os números são valores plausíveis para
-- colocar o cartão na fila certa, não o resultado de revisões reais:
--   novo         state 0 — nunca estudado
--   aprendendo   state 1 — visto há pouco, ainda em passos de aprendizado
--   revisao      state 2 — graduado; o p_vence decide se está em dia ou atrasado
--   reaprendendo state 3 — errou numa revisão e voltou para os passos
create function pg_temp.criar_cartao(
  p_email      text,
  p_deck       uuid,
  p_frase      text,
  p_traducao   text,
  p_estado     text     default 'novo',
  p_vence      interval default '0',   -- '-1 day' = atrasado; '3 days' = futuro
  p_fonetica   text     default null,
  p_dicas      jsonb    default '[]',  -- [{"type":"custom","text":"...","source":"user"}]
  p_lacunas    jsonb    default null,  -- pg_temp.trecho(frase, 'palavra') — nunca offsets à mão
  p_destaques  jsonb    default null,  -- idem, trechos em destaque na frase
  p_destaques_traducao jsonb default null,  -- pg_temp.trecho(traducao, '...')
  p_criado     interval default '0'
) returns uuid
language plpgsql as $$
declare
  v_id    uuid   := gen_random_uuid();
  v_now   bigint := pg_temp.agora_ms();
  v_due   bigint := pg_temp.ms(p_vence);
  v_ts    bigint := pg_temp.ms(p_criado);
  v_dia   bigint := 86400000;
  st smallint; s float8; d float8; sched float8; reps int; lapses int; last bigint;
begin
  case p_estado
    when 'novo'         then st := 0; s := 0;   d := 0;   sched := 0;  reps := 0; lapses := 0; last := null;
    when 'aprendendo'   then st := 1; s := 0.4; d := 5;   sched := 0;  reps := 1; lapses := 0; last := v_now - 600000;
    when 'revisao'      then st := 2; s := 10;  d := 5;   sched := 10; reps := 4; lapses := 0; last := v_due - 10 * v_dia;
    when 'reaprendendo' then st := 3; s := 2;   d := 6.5; sched := 0;  reps := 6; lapses := 1; last := v_now - 600000;
    else raise exception 'estado "%" inválido — use novo, aprendendo, revisao ou reaprendendo', p_estado;
  end case;

  insert into public.cards (
    id, user_id, deck_id, sentence, translation, phonetic, hints, cloze_ranges,
    emphasis_ranges, translation_emphasis_ranges,
    due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state,
    last_review, created_at, updated_at)
  values (
    v_id, pg_temp.uid(p_email), p_deck, p_frase, p_traducao, p_fonetica, p_dicas, p_lacunas,
    p_destaques, p_destaques_traducao,
    v_due, s, d, sched, sched, reps, lapses, st,
    last, v_ts, greatest(v_ts, v_now));
  return v_id;
end $$;

-- Card vivo do usuário pela frase exata; falha se não houver exatamente um.
create function pg_temp.cartao(p_email text, p_frase text) returns uuid
language plpgsql as $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.cards
  where user_id = pg_temp.uid(p_email) and sentence = p_frase and deleted_at = 0;
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    raise exception 'esperava 1 cartão vivo "%" de %, achei %', p_frase, p_email, coalesce(array_length(v_ids, 1), 0);
  end if;
  return v_ids[1];
end $$;

create function pg_temp.excluir_cartao(p_email text, p_cartao uuid) returns void
language plpgsql as $$
declare v_now bigint := pg_temp.agora_ms();
begin
  update public.cards set deleted_at = v_now, updated_at = v_now
  where user_id = pg_temp.uid(p_email) and id = p_cartao and deleted_at = 0;
  if not found then raise exception 'cartão % não encontrado (ou já excluído) em %', p_cartao, p_email; end if;
end $$;

-- ---------- histórico de estudo ----------

-- review_logs são imutáveis no app (heatmap, sequência, estatísticas). Para
-- "mudar o passado", recrie o cenário do zero em vez de editar logs.
create function pg_temp.criar_revisao(
  p_email        text,
  p_cartao       uuid,
  p_nota         text     default 'good',  -- 'good' | 'again'
  p_quando       interval default '0',     -- '-3 days' = estudado há 3 dias
  p_estado_antes integer  default 2,
  p_dias_agendados float8 default 1,
  p_duracao_ms   integer  default 4000
) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_uid uuid := pg_temp.uid(p_email); v_deck uuid;
begin
  select deck_id into v_deck from public.cards where user_id = v_uid and id = p_cartao;
  if v_deck is null then raise exception 'cartão % não existe em %', p_cartao, p_email; end if;
  insert into public.review_logs (
    id, user_id, card_id, deck_id, rating, reviewed_at, state_before, scheduled_days, duration_ms)
  values (
    v_id, v_uid, p_cartao, v_deck, p_nota, pg_temp.ms(p_quando), p_estado_antes, p_dias_agendados, p_duracao_ms);
  return v_id;
end $$;

-- ---------- conferência ----------

-- Resumo do que a conta tem no banco, para o relatório do cenário.
create function pg_temp.resumo(p_email text)
returns table (deck text, cards_vivos bigint, cards_excluidos bigint, novos bigint, vencidos bigint, revisoes bigint)
language sql as $$
  select d.name || case when d.deleted_at <> 0 then ' (excluído)' else '' end,
         count(c.id) filter (where c.deleted_at = 0),
         count(c.id) filter (where c.deleted_at <> 0),
         count(c.id) filter (where c.deleted_at = 0 and c.state = 0),
         count(c.id) filter (where c.deleted_at = 0 and c.state <> 0 and c.due <= pg_temp.agora_ms()),
         (select count(*) from public.review_logs l where l.user_id = d.user_id and l.deck_id = d.id)
  from public.decks d
  left join public.cards c on c.user_id = d.user_id and c.deck_id = d.id
  where d.user_id = pg_temp.uid(p_email)
  group by d.id, d.name, d.deleted_at, d.user_id, d.created_at
  order by d.created_at
$$;
