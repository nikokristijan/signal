# SIGNAL — Daily Zoom Challenge

> Can you recognize what you're looking at?

SIGNAL is a daily visual guessing game. Everyone gets the **same photograph** each day, zoomed in
so far that it's nearly unreadable. Guess what it is — or reveal another zoom level and risk
earning fewer points. One puzzle a day, a streak to protect, and friends to beat.

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase · Lucide**.

## How it plays

| Stage | Zoom | Points if correct |
| ----- | ---- | ----------------- |
| 1/5 | extreme close-up | 500 |
| 2/5 | a bit more | 400 |
| 3/5 | more context | 300 |
| 4/5 | recognizable | 200 |
| 5/5 | the whole subject | 100 |

* Every wrong answer costs **50 points** (never below zero) and you keep playing.
* Repeating a guess, or a too-generic one ("camera", "bus"), costs nothing.
* **Reveal next zoom** shows the next stage; **Give up** reveals the answer for 0 points.
* One attempt per calendar day. Challenges roll over at **local midnight**, with a countdown.
* Progress is saved on every action, so a refresh never loses anything.

All five stages are crops of **one** original photograph (nested, so each stage fully contains
the previous one) — see [Photos](#photos).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (scoring, matching, streaks, dataset integrity, repo flow)
npm run lint         # type-check
```

With no environment variables the app runs in **local demo mode**: your profile, attempts, friends
and scores live in the browser (`localStorage`), and the rest of the community is **simulated**
(`src/lib/repo/mock-community.ts`, deterministic, clearly labelled in the UI).

In development you can simulate another day with `?date=YYYY-MM-DD` (e.g. `/?date=2026-11-11`).
The override is disabled in production builds.

## Switching to Supabase

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` and
   `supabase/migrations/0002_storage.sql` in the SQL editor.
2. Generate and run the challenge seed: `node scripts/generate-seed.mjs > supabase/seed.sql`.
3. Upload the stage images to the private bucket:
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/upload-stages.mjs`.
4. Copy `.env.example` → `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the server-only `SUPABASE_SERVICE_ROLE_KEY`.
   In Auth settings enable email sign-in and add your site URL.

The UI never talks to Supabase directly. It uses the `GameRepository` interface
(`src/lib/repo/types.ts`) which has two implementations: `LocalRepository` and `SupabaseRepository`.
`getRepository()` picks one based on the env vars.

**Database** (`supabase/migrations/0001_init.sql`)

| Table | Purpose |
| ----- | ------- |
| `profiles` | users (id = `auth.users.id`), unique username, avatar colour |
| `challenges` | one row per day: answer, alternatives, nudges, category, difficulty, five stage image URLs, photo credit |
| `daily_attempts` | one row per player per challenge (`unique(user_id, challenge_id)`): stage, guesses, wrong count, status, score |
| `scores` | immutable result per finished challenge; leaderboards aggregate this |
| `friendships` | mutual friend relationships (both directions inserted by `add_friend`) |
| `streaks` | current/longest streak, maintained when a challenge is solved |

**Cheat resistance.** `challenges` has RLS enabled with *no* policies, and there are no insert/update
policies on attempts, scores, streaks or friendships. All gameplay goes through `SECURITY DEFINER`
functions (`start_attempt`, `submit_guess`, `reveal_stage`, `give_up`, `get_reveal`,
`leaderboard`, …). The answer is checked in Postgres and only returned by `get_reveal` after the
attempt is finished; clients can't post their own score.

> ⚠️ The Supabase adapter and SQL were written against the Supabase docs but **have not been run
> against a live project** in this repo's development environment (no Supabase instance was
> available). The local adapter and all game rules are covered by tests; run through the flow once
> on a fresh Supabase project before relying on it.

## Photos

Real photographs from **Wikimedia Commons**, each credited (author, licence, source page) in
`src/lib/data/challenges.json` and shown on the result screen.

`npm run photos` (`scripts/build-photos.mjs`) downloads the original, cuts the largest 4:3 frame,
and renders five WebP crops into `public/challenges/<slug>/stage-1..5.webp` using the focal point
and zoom factors from `challenges.json`. Only the small crops are committed.
Stage 1 is capped so the crop is never tighter than ~520 source pixels, and
`tests/dataset.test.ts` asserts every stage contains the previous one.

To add a challenge: append to `challenges.json` (answer, alternatives, nudges, `focus`, source +
credit), run `npm run photos`, then `npm run photos:sheet` and *look at the five stages*:
stage 1 should be hard but fair, stage 4 recognizable. `npm test` also checks that no answer (even
with typo tolerance) matches a different challenge.

**Images in Supabase mode are private.** The stage files live in a private bucket under opaque
paths (`sig-020/stage-3.webp`, never the subject name). The browser requests
`/api/stage?challenge=sig-020&stage=3`; that route checks the signed-in player's attempt and only
redirects to a 60-second signed URL for stages already revealed (or any stage once finished), so
the full photo can't be fetched early. In local demo mode the same images are plain static files in
`public/challenges/` — fine for a demo, but not spoiler-proof.

## What has been verified

* `npm test` — 29 unit tests: scoring, answer matching, attempt engine, streaks and dates, the
  dataset (32 challenges, unique ids/dates, five nested stages with files on disk, no answer
  matching a different challenge) and the full local-repository flow.
* End-to-end in a real browser (Playwright, mobile 390×844 and desktop 1280×800, against both
  `next dev` and `next start`): open today's challenge → view stage 1 → wrong answer (−50, image and
  input unchanged) → reveal stage 2 → correct answer (score 350) → leaderboard (all five tabs, current
  user highlighted) → refresh (progress and result persist, including mid-game) → stats, history,
  friends and invite link.
* **Not verified:** the Supabase adapter, SQL migrations and `/api/stage` (no Supabase project was
  available). Run them against a fresh project before relying on them.

## Project layout

```
src/app/                 pages: / · /play · /leaderboard · /stats · /friends · /invite/[username]
src/components/          Header, ZoomImage, GuessForm, ResultCard, LeaderboardTable, …
src/lib/game/            pure rules: scoring, answer matching, attempt engine, stats, dates, share text
src/lib/data/            curated challenge dataset (+ typed accessors)
src/lib/repo/            GameRepository interface · local adapter · Supabase adapter · simulated community
supabase/migrations/     schema, RLS, game functions
scripts/                 photo pipeline, contact sheets, seed generator
tests/                   vitest suites
```
