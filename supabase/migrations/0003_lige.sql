-- BOMBA — migracija 0003: dvije lige, dnevna i trening
--
--   dnevna liga  (mode = 'daily')   : svi dan dobivaju isti niz slogova; ljestvice po danu / tjednu / ukupno; utječe na niz dana
--   trening liga (mode = 'training'): svaka partija ima svoj niz slogova koji ODREĐUJE SERVER (seed = id partije, gen_random_uuid),
--                                     pa klijent ne može birati lagane slogove; vlastite ljestvice; NE utječe na niz dana
--
-- Rezultati u obje lige gledaju se kao NAJBOLJA pojedinačna partija (high score), kao u 0002.
-- Postojeće partije i rezultati ostaju u dnevnoj ligi.

alter table public.games  add column if not exists mode text not null default 'daily';
alter table public.scores add column if not exists mode text not null default 'daily';
alter table public.games  add constraint games_mode_check  check (mode in ('daily', 'training'));
alter table public.scores add constraint scores_mode_check check (mode in ('daily', 'training'));
create index if not exists scores_mode_date_idx    on public.scores (mode, challenge_date, points desc);
create index if not exists games_user_mode_date_idx on public.games  (user_id, mode, challenge_date, started_at desc);

-- ─────────────────── upis rezultata (SAMO service_role) ───────────────
-- Isti potpis kao u 0002 (ovlasti ostaju), ali upisuje ligu i niz dana mijenja samo dnevna liga.
create or replace function public.bomba_record_result(
  p_game uuid, p_score int, p_words int, p_max_combo int, p_longest text,
  p_word_list text[], p_booms int, p_duration_ms int, p_log jsonb, p_log_hash text
) returns void
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  update public.games set
    status = 'finished', finished_at = now(), score = p_score, words = p_words, max_combo = p_max_combo,
    longest = p_longest, word_list = p_word_list, booms = p_booms, duration_ms = p_duration_ms,
    log = p_log, log_hash = p_log_hash
  where id = p_game and status = 'playing'
  returning * into g;
  if not found then raise exception 'Nema aktivne partije'; end if;

  insert into public.scores (game_id, user_id, challenge_date, points, words, max_combo, longest, mode)
  values (g.id, g.user_id, g.challenge_date, p_score, p_words, p_max_combo, coalesce(p_longest, ''), g.mode);

  if g.mode = 'daily' then
    perform public.bomba_update_streak(g.user_id, g.challenge_date);
  end if;
end $$;

-- ───────────────────────────── ljestvice ──────────────────────────────
-- p_mode: daily | training. p_scope: friends | daily | weekly | all.
-- Dnevna liga, „friends" = današnji najbolji među prijateljima. Trening liga nema „današnji niz", pa je „friends" = high score prijatelja svih vremena.
drop function if exists public.leaderboard(text, date);
create function public.leaderboard(p_scope text, p_date date, p_mode text default 'daily')
returns table (rank bigint, user_id uuid, username text, avatar_color text, points bigint, words bigint)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select case
             when p_scope = 'daily' then p_date
             when p_scope = 'friends' and p_mode = 'daily' then p_date
             when p_scope = 'weekly' then date_trunc('week', p_date)::date
             else date '1970-01-01' end as d_from
  ),
  best as (
    select distinct on (s.user_id) s.user_id as uid, s.points as pts, s.words as wds
    from public.scores s
    where s.mode = p_mode
      and s.challenge_date between (select d_from from bounds) and p_date
      and (p_scope <> 'friends'
           or s.user_id = auth.uid()
           or s.user_id in (select f.friend_id from public.friendships f where f.user_id = auth.uid()))
    order by s.user_id, s.points desc, s.words desc, s.finished_at
  ),
  ranked as (
    select rank() over (order by b.pts desc, b.wds desc) as rnk, p.id as uid, p.username, p.avatar_color,
           b.pts::bigint as pts, b.wds::bigint as wds
    from best b join public.profiles p on p.id = b.uid
  )
  select rnk, uid, username, avatar_color, pts, wds
  from ranked
  where rnk <= 50 or uid = auth.uid()
  order by rnk, username
$$;

-- „Duhovi" prijatelja na traci napretka:
--   dnevna: najbolja današnja partija svakog prijatelja koji je danas igrao;
--   trening: najbolja trening partija svakog prijatelja svih vremena (nizovi se razlikuju, pa je cilj „koliko riječi su dogurali").
drop function if exists public.friends_today(date);
create function public.friends_ghosts(p_date date, p_mode text default 'daily')
returns table (user_id uuid, username text, avatar_color text, words int, points int)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (p.id) p.id, p.username, p.avatar_color, s.words, s.points
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
    join public.scores s on s.user_id = p.id and s.mode = p_mode and (p_mode = 'training' or s.challenge_date = p_date)
    where f.user_id = auth.uid()
    order by p.id, s.points desc, s.words desc
  ) t
  order by t.words
$$;

-- Prijatelji: današnja najbolja dnevna partija, dnevni high score i trening high score.
drop function if exists public.list_friends(date);
create function public.list_friends(p_date date)
returns table (user_id uuid, username text, avatar_color text, today_words int, today_points int, best_points int, training_best int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color,
         (select s.words  from public.scores s where s.user_id = p.id and s.mode = 'daily' and s.challenge_date = p_date order by s.points desc, s.words desc limit 1),
         (select s.points from public.scores s where s.user_id = p.id and s.mode = 'daily' and s.challenge_date = p_date order by s.points desc, s.words desc limit 1),
         coalesce((select max(s.points) from public.scores s where s.user_id = p.id and s.mode = 'daily'), 0),
         coalesce((select max(s.points) from public.scores s where s.user_id = p.id and s.mode = 'training'), 0)
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by 6 desc, p.username
$$;

-- ───────────────────────────── ovlasti ───────────────────────────────
revoke execute on function public.leaderboard(text, date, text)    from public, anon;
revoke execute on function public.friends_ghosts(date, text)       from public, anon;
revoke execute on function public.list_friends(date)               from public, anon;
grant  execute on function public.leaderboard(text, date, text)    to authenticated;
grant  execute on function public.friends_ghosts(date, text)       to authenticated;
grant  execute on function public.list_friends(date)               to authenticated;
