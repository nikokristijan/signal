-- Private bucket for the five zoom-stage images of every challenge.
-- No storage.objects policies are created on purpose: neither anon nor authenticated users can read
-- the bucket directly. Images are served by the Next.js route /api/stage, which uses the service role
-- to create a short-lived signed URL, and only for stages the player has already revealed.
insert into storage.buckets (id, name, public)
values ('challenge-stages', 'challenge-stages', false)
on conflict (id) do update set public = false;
