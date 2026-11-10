-- SIGNAL — initial schema
-- Tables: profiles (users), challenges, daily_attempts, scores, friendships, streaks.
-- All gameplay writes go through SECURITY DEFINER functions so that:
--   * the answer never leaves the database until an attempt is finished,
--   * scoring rules are enforced server-side (clients cannot post their own score).

create extension if not exists unaccent;
create extension if not exists fuzzystrmatch;

-- ───────────────────────────── users ─────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  avatar_color text not null default 'green',
  created_at   timestamptz not null default now()
);

-- Creates the profile when someone signs up. The username is passed as sign-up metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), ''));
  final_name text;
begin
  if wanted !~ '^[a-z0-9_]{3,16}$' then
    wanted := 'player' || floor(1000 + random() * 9000)::int;
  end if;
  final_name := wanted;
  while exists (select 1 from public.profiles where username = final_name) loop
    final_name := left(wanted, 11) || floor(1000 + random() * 9000)::int;
  end loop;
  insert into public.profiles (id, username) values (new.id, final_name);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────── challenges ──────────────────────────
create table public.challenges (
  id            text primary key,                 -- 'sig-020'
  number        int  not null unique,
  publish_date  date not null unique,
  slug          text not null,
  subject       text not null,
  answer        text not null,
  alternatives  text[] not null default '{}',
  nudges        text[] not null default '{}',
  category      text not null,
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  fact          text not null,
  -- Storage paths in the private 'challenge-stages' bucket, e.g. 'sig-020/stage-1.webp' (opaque: never the subject name).
  -- Five crops of ONE photo.
  stage_images  text[] not null check (array_length(stage_images, 1) = 5),
  credit        jsonb not null default '{}'
);

-- ─────────────────────────── daily attempts ──────────────────────
create table public.daily_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  challenge_id text not null references public.challenges (id),
  stage        int  not null default 1 check (stage between 1 and 5),
  wrong_count  int  not null default 0,
  guesses      jsonb not null default '[]',        -- [{text, stage, correct}]
  status       text not null default 'playing' check (status in ('playing', 'solved', 'gave_up')),
  score        int  not null default 500 check (score >= 0),
  solved_stage int,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (user_id, challenge_id)                   -- one attempt per player per day
);

-- ───────────────────────────── scores ────────────────────────────
-- One immutable row per finished challenge. Leaderboards aggregate this table.
create table public.scores (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  challenge_id text not null references public.challenges (id),
  score_date   date not null,
  points       int  not null check (points >= 0),
  stage_solved int,
  created_at   timestamptz not null default now(),
  primary key (user_id, challenge_id)
);
create index scores_date_idx on public.scores (score_date, points desc);

-- ──────────────────────────── friendships ────────────────────────
-- Friendship is mutual: add_friend() inserts both directions.
create table public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ───────────────────────────── streaks ───────────────────────────
create table public.streaks (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  current_streak   int  not null default 0,
  longest_streak   int  not null default 0,
  last_solved_date date
);

-- ─────────────────────── row level security ──────────────────────
alter table public.profiles       enable row level security;
alter table public.challenges     enable row level security;   -- no policy: answers are never readable directly
alter table public.daily_attempts enable row level security;
alter table public.scores         enable row level security;
alter table public.friendships    enable row level security;
alter table public.streaks        enable row level security;

create policy "own profile: read"   on public.profiles for select using (id = auth.uid());
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own attempts: read"  on public.daily_attempts for select using (user_id = auth.uid());
create policy "own scores: read"    on public.scores for select using (user_id = auth.uid());
create policy "own friendships: read" on public.friendships for select using (user_id = auth.uid());
create policy "own streak: read"    on public.streaks for select using (user_id = auth.uid());
-- Deliberately no insert/update/delete policies on attempts, scores, streaks or friendships.

-- ───────────────────────── answer matching ───────────────────────
-- Mirrors src/lib/game/answers.ts so local and Supabase modes judge identically.
create or replace function public.signal_normalize(t text) returns text
language plpgsql stable as $$
declare
  s text; toks text[]; res text[] := '{}'; tok text;
begin
  s := lower(unaccent(coalesce(t, '')));
  s := regexp_replace(s, '[''’`]', '', 'g');
  s := regexp_replace(s, '[^a-z0-9\s]', ' ', 'g');
  s := trim(regexp_replace(s, '\s+', ' ', 'g'));
  toks := string_to_array(s, ' ');
  while coalesce(array_length(toks, 1), 0) > 1 and toks[1] in ('the', 'a', 'an') loop
    toks := toks[2:array_length(toks, 1)];
  end loop;
  foreach tok in array toks loop
    if length(tok) > 3 and tok like '%s' and tok not like '%ss' then
      tok := left(tok, length(tok) - 1);
    end if;
    res := res || tok;
  end loop;
  return array_to_string(res, ' ');
end $$;

create or replace function public.signal_matches(guess text, candidate text) returns boolean
language plpgsql stable as $$
declare g text := signal_normalize(left(guess, 60)); c text := signal_normalize(left(candidate, 60));
begin
  if g = '' or c = '' then return false; end if;
  return g = c or levenshtein(g, c) <= case when length(c) >= 12 then 2 when length(c) >= 6 then 1 else 0 end;
end $$;

create or replace function public.signal_score(p_stage int, p_wrong int) returns int
language sql immutable as $$ select greatest(0, (600 - 100 * p_stage) - 50 * p_wrong) $$;

-- ───────────────────────────── gameplay API ──────────────────────
-- A challenge may be opened from one day before UTC today to one day after (timezones).
create or replace function public.signal_assert_available(p_challenge text) returns public.challenges
language plpgsql stable security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found then raise exception 'Unknown challenge'; end if;
  if c.publish_date > (now() at time zone 'utc')::date + 1 then raise exception 'Challenge not available yet'; end if;
  return c;
end $$;

-- Public view of a day's challenge: never includes the answer or the image paths.
-- Images are fetched through /api/stage, which signs a URL only for stages the player has revealed.
create or replace function public.get_challenge(p_date date)
returns table (id text, number int, publish_date date)
language sql stable security definer set search_path = public as $$
  select c.id, c.number, c.publish_date
  from public.challenges c
  where c.publish_date = p_date and p_date <= (now() at time zone 'utc')::date + 1
$$;

create or replace function public.start_attempt(p_challenge text) returns public.daily_attempts
language plpgsql security definer set search_path = public as $$
declare a public.daily_attempts;
begin
  perform public.signal_assert_available(p_challenge);
  insert into public.daily_attempts (user_id, challenge_id) values (auth.uid(), p_challenge)
    on conflict (user_id, challenge_id) do nothing;
  select * into a from public.daily_attempts where user_id = auth.uid() and challenge_id = p_challenge;
  return a;
end $$;

create or replace function public.signal_update_streak(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare s public.streaks;
begin
  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks values (p_user, 1, 1, p_date);
  elsif s.last_solved_date = p_date then
    return;
  else
    update public.streaks set
      current_streak = case when s.last_solved_date = p_date - 1 then s.current_streak + 1 else 1 end,
      longest_streak = greatest(s.longest_streak, case when s.last_solved_date = p_date - 1 then s.current_streak + 1 else 1 end),
      last_solved_date = p_date
    where user_id = p_user;
  end if;
end $$;

create or replace function public.signal_finish(a public.daily_attempts, c public.challenges) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.scores (user_id, challenge_id, score_date, points, stage_solved)
  values (a.user_id, a.challenge_id, c.publish_date, a.score, a.solved_stage)
  on conflict do nothing;
  if a.status = 'solved' then perform public.signal_update_streak(a.user_id, c.publish_date); end if;
end $$;

create or replace function public.submit_guess(p_challenge text, p_guess text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges; a public.daily_attempts; g jsonb; verdict text; penalty int := 0; guess text := left(trim(p_guess), 60);
begin
  c := public.signal_assert_available(p_challenge);
  select * into a from public.daily_attempts where user_id = auth.uid() and challenge_id = p_challenge for update;
  if not found then raise exception 'Attempt not started'; end if;
  if a.status <> 'playing' or public.signal_normalize(guess) = '' then
    return jsonb_build_object('verdict', case when a.status <> 'playing' then 'duplicate' else 'empty' end, 'penalty', 0, 'attempt', to_jsonb(a));
  end if;

  for g in select * from jsonb_array_elements(a.guesses) loop
    if public.signal_normalize(g ->> 'text') = public.signal_normalize(guess) then
      return jsonb_build_object('verdict', 'duplicate', 'penalty', 0, 'attempt', to_jsonb(a));
    end if;
  end loop;

  if public.signal_matches(guess, c.answer) or exists (select 1 from unnest(c.alternatives) alt where public.signal_matches(guess, alt)) then
    verdict := 'correct';
    update public.daily_attempts set
      guesses = guesses || jsonb_build_array(jsonb_build_object('text', guess, 'stage', stage, 'correct', true)),
      status = 'solved', solved_stage = stage, score = public.signal_score(stage, wrong_count), finished_at = now()
    where id = a.id returning * into a;
    perform public.signal_finish(a, c);
  elsif exists (select 1 from unnest(c.nudges) n where public.signal_normalize(n) = public.signal_normalize(guess)) then
    verdict := 'close';
  else
    verdict := 'wrong';
    penalty := public.signal_score(a.stage, a.wrong_count) - public.signal_score(a.stage, a.wrong_count + 1);
    update public.daily_attempts set
      guesses = guesses || jsonb_build_array(jsonb_build_object('text', guess, 'stage', stage, 'correct', false)),
      wrong_count = wrong_count + 1, score = public.signal_score(stage, wrong_count + 1)
    where id = a.id returning * into a;
  end if;
  return jsonb_build_object('verdict', verdict, 'penalty', penalty, 'attempt', to_jsonb(a));
end $$;

create or replace function public.reveal_stage(p_challenge text) returns public.daily_attempts
language plpgsql security definer set search_path = public as $$
declare a public.daily_attempts;
begin
  update public.daily_attempts set stage = stage + 1, score = public.signal_score(stage + 1, wrong_count)
  where user_id = auth.uid() and challenge_id = p_challenge and status = 'playing' and stage < 5
  returning * into a;
  if not found then
    select * into a from public.daily_attempts where user_id = auth.uid() and challenge_id = p_challenge;
  end if;
  return a;
end $$;

create or replace function public.give_up(p_challenge text) returns public.daily_attempts
language plpgsql security definer set search_path = public as $$
declare a public.daily_attempts; c public.challenges;
begin
  c := public.signal_assert_available(p_challenge);
  update public.daily_attempts set status = 'gave_up', score = 0, stage = 5, finished_at = now()
  where user_id = auth.uid() and challenge_id = p_challenge and status = 'playing'
  returning * into a;
  if found then
    perform public.signal_finish(a, c);
  else
    select * into a from public.daily_attempts where user_id = auth.uid() and challenge_id = p_challenge;
  end if;
  return a;
end $$;

-- The answer, facts and photo credit — only for a finished attempt.
create or replace function public.get_reveal(p_challenge text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('subject', c.subject, 'answer', c.answer, 'category', c.category,
                            'difficulty', c.difficulty, 'fact', c.fact, 'credit', c.credit)
  from public.challenges c
  join public.daily_attempts a on a.challenge_id = c.id and a.user_id = auth.uid()
  where c.id = p_challenge and a.status <> 'playing'
$$;

create or replace function public.get_history() returns table (
  challenge_id text, publish_date date, number int, subject text, category text,
  stage int, wrong_count int, status text, score int, solved_stage int, started_at timestamptz, finished_at timestamptz, guesses jsonb
) language sql stable security definer set search_path = public as $$
  select a.challenge_id, c.publish_date, c.number, c.subject, c.category,
         a.stage, a.wrong_count, a.status, a.score, a.solved_stage, a.started_at, a.finished_at, a.guesses
  from public.daily_attempts a join public.challenges c on c.id = a.challenge_id
  where a.user_id = auth.uid() and a.status <> 'playing'
  order by c.publish_date desc
$$;

create or replace function public.get_streak(p_today date) returns table (current_streak int, longest_streak int)
language sql stable security definer set search_path = public as $$
  select case when s.last_solved_date >= p_today - 1 then s.current_streak else 0 end, s.longest_streak
  from public.streaks s where s.user_id = auth.uid()
$$;

-- ───────────────────────────── social ────────────────────────────
create or replace function public.add_friend(p_username text) returns table (user_id uuid, username text, avatar_color text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare f public.profiles;
begin
  select * into f from public.profiles where username = lower(trim(p_username));
  if not found then raise exception 'No player named %', lower(trim(p_username)); end if;
  if f.id = auth.uid() then raise exception 'That''s you!'; end if;
  if exists (select 1 from public.friendships where friendships.user_id = auth.uid() and friend_id = f.id) then
    raise exception '% is already your friend.', f.username;
  end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), f.id), (f.id, auth.uid()) on conflict do nothing;
  return query select f.id, f.username, f.avatar_color;
end $$;

create or replace function public.remove_friend(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid())
$$;

create or replace function public.list_friends(p_today date)
returns table (user_id uuid, username text, avatar_color text, today_points int, total_points bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color,
         max(s.points) filter (where s.score_date = p_today),
         coalesce(sum(s.points), 0)::bigint
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.scores s on s.user_id = p.id
  where f.user_id = auth.uid()
  group by p.id, p.username, p.avatar_color
  order by 5 desc, p.username
$$;

-- p_scope: friends | daily | weekly | monthly | all
create or replace function public.leaderboard(p_scope text, p_today date)
returns table (user_id uuid, username text, avatar_color text, points bigint, today_points int, rank bigint)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select case p_scope
             when 'daily'   then p_today
             when 'weekly'  then date_trunc('week', p_today)::date
             when 'monthly' then date_trunc('month', p_today)::date
             else date '1970-01-01' end as d_from
  ),
  pool as (
    select p.id, p.username, p.avatar_color from public.profiles p
    where p_scope <> 'friends'
       or p.id = auth.uid()
       or p.id in (select friend_id from public.friendships where friendships.user_id = auth.uid())
  ),
  agg as (
    select pool.id, pool.username, pool.avatar_color,
           coalesce(sum(s.points) filter (where s.score_date between (select d_from from bounds) and p_today), 0)::bigint as points,
           max(s.points) filter (where s.score_date = p_today) as today_points,
           count(*) filter (where s.score_date between (select d_from from bounds) and p_today) as played
    from pool left join public.scores s on s.user_id = pool.id
    group by pool.id, pool.username, pool.avatar_color
  )
  select id, username, avatar_color, points, today_points, rank() over (order by points desc)
  from agg
  where p_scope = 'friends' or played > 0
  order by points desc, username
$$;

revoke all on function public.signal_update_streak(uuid, date), public.signal_finish(public.daily_attempts, public.challenges) from public, anon, authenticated;
revoke execute on all functions in schema public from anon;
grant execute on function
  public.get_challenge(date), public.start_attempt(text), public.submit_guess(text, text), public.reveal_stage(text),
  public.give_up(text), public.get_reveal(text), public.get_history(), public.get_streak(date),
  public.add_friend(text), public.remove_friend(uuid), public.list_friends(date), public.leaderboard(text, date)
to authenticated;
