-- BOMBA — migracija 0002: neograničen broj partija, gleda se NAJBOLJI rezultat (high score)
--
-- Prije: jedan rangirani pokušaj dnevno (games unique po igraču i danu, scores jedan red po danu, ljestvice zbrajaju).
-- Sada: igrač može igrati koliko god puta; svi pokušaji istog dana koriste isti niz slogova;
--       ljestvice (danas / tjedan / ukupno / prijatelji) rangiraju po NAJBOLJOJ partiji u tom razdoblju.
-- Sigurnosni model je isti: klijent ne upisuje ništa, rezultat upisuje samo server (service_role) nakon replaya.

-- ─────────────────────────────── partije ─────────────────────────────
alter table public.games drop constraint if exists games_user_id_challenge_date_key;
alter table public.games add column if not exists attempt_no int not null default 1;   -- redni broj partije tog dana
alter table public.games add column if not exists log_hash text;                       -- sha256 zapisa: idempotentno slanje
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check check (status in ('playing', 'finished', 'abandoned'));
create index if not exists games_user_date_idx on public.games (user_id, challenge_date, started_at desc);

-- ─────────────────────────────── rezultati ───────────────────────────
-- Jedan red po ZAVRŠENOJ PARTIJI (prije: po danu).
alter table public.scores add column if not exists game_id uuid references public.games (id) on delete cascade;
update public.scores s set game_id = g.id
from public.games g
where s.game_id is null and g.user_id = s.user_id and g.challenge_date = s.challenge_date and g.status = 'finished';
delete from public.scores where game_id is null;
alter table public.scores drop constraint if exists scores_pkey;
alter table public.scores alter column game_id set not null;
alter table public.scores add primary key (game_id);
create index if not exists scores_user_date_idx on public.scores (user_id, challenge_date, points desc);

-- ─────────────────── upis rezultata (SAMO service_role) ───────────────
drop function if exists public.bomba_record_result(uuid, date, int, int, int, text, text[], int, int, jsonb);

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

  insert into public.scores (game_id, user_id, challenge_date, points, words, max_combo, longest)
  values (g.id, g.user_id, g.challenge_date, p_score, p_words, p_max_combo, coalesce(p_longest, ''));

  -- niz dana = uzastopni dani s barem jednom odigranom partijom (druga partija istog dana ne mijenja niz)
  perform public.bomba_update_streak(g.user_id, g.challenge_date);
end $$;

-- ───────────────────────────── ljestvice (high score) ─────────────────
-- p_scope: friends (današnji najbolji među prijateljima) | daily | weekly | all.
-- Za svakog igrača vrijedi njegova NAJBOLJA partija u razdoblju (bodovi, pri jednakosti više riječi).
create or replace function public.leaderboard(p_scope text, p_date date)
returns table (rank bigint, user_id uuid, username text, avatar_color text, points bigint, words bigint)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select case p_scope
             when 'daily'   then p_date
             when 'friends' then p_date
             when 'weekly'  then date_trunc('week', p_date)::date
             else date '1970-01-01' end as d_from
  ),
  best as (
    select distinct on (s.user_id) s.user_id as uid, s.points as pts, s.words as wds
    from public.scores s
    where s.challenge_date between (select d_from from bounds) and p_date
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

-- „Duhovi": najbolja današnja partija svakog prijatelja koji je danas igrao.
create or replace function public.friends_today(p_date date)
returns table (user_id uuid, username text, avatar_color text, words int, points int)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (p.id) p.id, p.username, p.avatar_color, s.words, s.points
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
    join public.scores s on s.user_id = p.id and s.challenge_date = p_date
    where f.user_id = auth.uid()
    order by p.id, s.points desc, s.words desc
  ) t
  order by t.words
$$;

-- Prijatelji: današnja najbolja partija i high score svih vremena.
drop function if exists public.list_friends(date);
create function public.list_friends(p_date date)
returns table (user_id uuid, username text, avatar_color text, today_words int, today_points int, best_points int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color,
         (select s.words  from public.scores s where s.user_id = p.id and s.challenge_date = p_date order by s.points desc, s.words desc limit 1),
         (select s.points from public.scores s where s.user_id = p.id and s.challenge_date = p_date order by s.points desc, s.words desc limit 1),
         coalesce((select max(s.points) from public.scores s where s.user_id = p.id), 0)
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by 6 desc, p.username
$$;

-- ───────────────────────────── ovlasti ───────────────────────────────
-- Nove/ponovno stvorene funkcije dobivaju zadane ovlasti (izvršavanje za sve): zatvori ih ponovno.
revoke execute on function public.bomba_record_result(uuid, int, int, int, text, text[], int, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.bomba_record_result(uuid, int, int, int, text, text[], int, int, jsonb, text) to service_role;
revoke execute on function public.list_friends(date) from public, anon;
grant execute on function public.list_friends(date) to authenticated;
