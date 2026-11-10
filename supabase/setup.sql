-- BOMBA: potpuno postavljanje baze (sve migracije odjednom).
-- Zalijepi cijelu datoteku u Supabase → SQL Editor → Run, na PRAZNOM projektu.
-- Generirano skriptom scripts/build-setup-sql.mjs (npm run sql:setup). Ne uređuj ručno.
-- Migracije: 0001_init.sql, 0002_neogranicene_partije.sql, 0003_lige.sql
-- Ako baza već ima starije migracije, ne pokreći ovo, nego samo one koje nedostaju.

-- ════════════════════════════ 0001_init.sql ════════════════════════════
-- BOMBA — početna shema
-- Tablice: profiles (korisnici), games (partije), scores (rezultati), friendships (prijatelji), streaks (nizovi).
--
-- Sigurnosni model:
--   * klijent NE MOŽE upisati partiju, rezultat ni niz: nema insert/update politika na games/scores/streaks;
--   * partije upisuje samo server (Next.js API ruta sa service-role ključem): ponovno odigra zapis,
--     provjeri ga i poziva bomba_record_result() (funkciju smije pozvati samo service_role);
--   * ljestvice i prijatelji idu kroz SECURITY DEFINER funkcije koje vraćaju samo agregirane podatke.

-- ───────────────────────────── korisnici ─────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  avatar_color text not null default 'green',
  created_at   timestamptz not null default now()
);

-- Profil nastaje čim se netko prijavi (i anonimno): nasumično ime „igrac1234", koje igrač kasnije promijeni.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), ''));
  final_name text;
  colors text[] := array['green','blue','amber','rose','violet','teal','slate','clay'];
begin
  if wanted !~ '^[a-z0-9_]{3,16}$' then
    wanted := 'igrac' || floor(1000 + random() * 9000)::int;
  end if;
  final_name := wanted;
  while exists (select 1 from public.profiles where username = final_name) loop
    final_name := left(wanted, 11) || floor(1000 + random() * 9000)::int;
  end loop;
  insert into public.profiles (id, username, avatar_color)
  values (new.id, final_name, colors[1 + floor(random() * array_length(colors, 1))::int]);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────── partije ─────────────────────────────
-- Jedan rangirani pokušaj po igraču i danu (unique). Dan je zagrebački datum.
create table public.games (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  challenge_date   date not null,
  challenge_number int  not null,
  status           text not null default 'playing' check (status in ('playing', 'finished')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  attempts         int  not null default 0,          -- neuspjeli pokušaji slanja zapisa
  score            int  check (score >= 0),
  words            int,
  max_combo        int,
  longest          text,
  word_list        text[],
  booms            int,
  duration_ms      int,
  log              jsonb,                             -- zapis za reviziju: [{w, t}, …]
  unique (user_id, challenge_date)
);

-- ─────────────────────────────── rezultati ───────────────────────────
-- Nepromjenjiv rezultat završene dnevne partije. Ljestvice zbrajaju ovu tablicu.
create table public.scores (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  challenge_date date not null,
  points         int  not null check (points >= 0),
  words          int  not null,
  max_combo      int  not null,
  longest        text not null default '',
  finished_at    timestamptz not null default now(),
  primary key (user_id, challenge_date)
);
create index scores_date_idx on public.scores (challenge_date, points desc);

-- ───────────────────────────── prijatelji ────────────────────────────
-- Prijateljstvo je obostrano: add_friend() upisuje oba smjera.
create table public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ─────────────────────────────── nizovi ──────────────────────────────
create table public.streaks (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  current_streak   int  not null default 0,
  longest_streak   int  not null default 0,
  last_played_date date
);

-- ───────────────────────── row level security ────────────────────────
alter table public.profiles    enable row level security;
alter table public.games       enable row level security;
alter table public.scores      enable row level security;
alter table public.friendships enable row level security;
alter table public.streaks     enable row level security;

create policy "profil: čitaj svoj"    on public.profiles    for select using (id = auth.uid());
create policy "profil: uredi svoj"    on public.profiles    for update using (id = auth.uid()) with check (id = auth.uid());
create policy "partije: čitaj svoje"  on public.games       for select using (user_id = auth.uid());
create policy "rezultati: čitaj svoje" on public.scores     for select using (user_id = auth.uid());
create policy "prijatelji: čitaj svoje" on public.friendships for select using (user_id = auth.uid());
create policy "niz: čitaj svoj"       on public.streaks     for select using (user_id = auth.uid());
-- Namjerno nema insert/update/delete politika na games, scores, streaks i friendships.

-- ─────────────────── upis rezultata (SAMO service_role) ───────────────
create or replace function public.bomba_update_streak(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare s public.streaks;
begin
  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks values (p_user, 1, 1, p_date);
  elsif s.last_played_date = p_date then
    return;
  else
    update public.streaks set
      current_streak = case when s.last_played_date = p_date - 1 then s.current_streak + 1 else 1 end,
      longest_streak = greatest(s.longest_streak, case when s.last_played_date = p_date - 1 then s.current_streak + 1 else 1 end),
      last_played_date = p_date
    where user_id = p_user;
  end if;
end $$;

create or replace function public.bomba_record_result(
  p_user uuid, p_date date, p_score int, p_words int, p_max_combo int, p_longest text,
  p_word_list text[], p_booms int, p_duration_ms int, p_log jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.games set
    status = 'finished', finished_at = now(), score = p_score, words = p_words, max_combo = p_max_combo,
    longest = p_longest, word_list = p_word_list, booms = p_booms, duration_ms = p_duration_ms, log = p_log
  where user_id = p_user and challenge_date = p_date and status = 'playing';
  if not found then raise exception 'Nema aktivne partije za taj dan'; end if;

  insert into public.scores (user_id, challenge_date, points, words, max_combo, longest)
  values (p_user, p_date, p_score, p_words, p_max_combo, coalesce(p_longest, ''))
  on conflict do nothing;

  perform public.bomba_update_streak(p_user, p_date);
end $$;

-- ───────────────────────────── ljestvice i prijatelji ─────────────────
-- p_scope: friends (današnji rezultati prijatelja + ti) | daily | weekly | all
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
  agg as (
    select p.id as uid, p.username, p.avatar_color,
           sum(s.points)::bigint as pts, sum(s.words)::bigint as wds
    from public.scores s
    join public.profiles p on p.id = s.user_id
    where s.challenge_date between (select d_from from bounds) and p_date
      and (p_scope <> 'friends'
           or p.id = auth.uid()
           or p.id in (select f.friend_id from public.friendships f where f.user_id = auth.uid()))
    group by p.id, p.username, p.avatar_color
  ),
  ranked as (
    select rank() over (order by pts desc, wds desc) as rnk, * from agg
  )
  select rnk, uid, username, avatar_color, pts, wds
  from ranked
  where rnk <= 50 or uid = auth.uid()
  order by rnk, username
$$;

-- „Duhovi": prijatelji koji su na dan p_date već odigrali (riječi i bodovi).
create or replace function public.friends_today(p_date date)
returns table (user_id uuid, username text, avatar_color text, words int, points int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color, s.words, s.points
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  join public.scores s on s.user_id = p.id and s.challenge_date = p_date
  where f.user_id = auth.uid()
  order by s.words
$$;

create or replace function public.list_friends(p_date date)
returns table (user_id uuid, username text, avatar_color text, today_words int, today_points int, total_points bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color,
         max(s.words) filter (where s.challenge_date = p_date),
         max(s.points) filter (where s.challenge_date = p_date),
         coalesce(sum(s.points), 0)::bigint
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.scores s on s.user_id = p.id
  where f.user_id = auth.uid()
  group by p.id, p.username, p.avatar_color
  order by 6 desc, p.username
$$;

create or replace function public.add_friend(p_username text)
returns table (user_id uuid, username text, avatar_color text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare f public.profiles;
begin
  select * into f from public.profiles where username = lower(trim(p_username));
  if not found then raise exception 'Nema igrača „%"', lower(trim(p_username)); end if;
  if f.id = auth.uid() then raise exception 'To si ti!'; end if;
  if exists (select 1 from public.friendships where friendships.user_id = auth.uid() and friend_id = f.id) then
    raise exception '% ti je već prijatelj.', f.username;
  end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), f.id), (f.id, auth.uid()) on conflict do nothing;
  return query select f.id, f.username, f.avatar_color;
end $$;

create or replace function public.remove_friend(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid())
$$;

-- ───────────────────────────── ovlasti ───────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.bomba_record_result(uuid, date, int, int, int, text, text[], int, int, jsonb) to service_role;
grant execute on function
  public.leaderboard(text, date), public.friends_today(date), public.list_friends(date),
  public.add_friend(text), public.remove_friend(uuid)
to authenticated;

-- ════════════════════════════ 0002_neogranicene_partije.sql ════════════════════════════
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

-- ════════════════════════════ 0003_lige.sql ════════════════════════════
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
