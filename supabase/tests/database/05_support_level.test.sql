-- line_support: each learner's current support level per line, derived from
-- their line-attempt history (no stored progress).
--
-- Levels: 3 = characters + pinyin + English, 2 = characters + pinyin,
-- 1 = English only, 0 = nothing. Rule under test: take the learner's latest
-- attempt on the line; if it passed, the line has faded one level below the
-- level it was attempted at (floor 0); otherwise it stays at that level.
begin;
select plan(11);

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test');
insert into public.scene (id, owner_id, title, source) values
  ('50000000-0000-0000-0000-000000000000', null, 'Test starter', 'starter');
insert into public.character (id, scene_id, name) values
  ('c0a00000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'Mum');
insert into public.line (id, scene_id, character_id, position, hanzi, pinyin, english) values
  ('10100000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 1, '一', 'yī', 'one'),
  ('10200000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 2, '二', 'èr', 'two'),
  ('10300000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 3, '三', 'sān', 'three'),
  ('10400000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 4, '四', 'sì', 'four'),
  ('10500000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 5, '五', 'wǔ', 'five'),
  ('10600000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 6, '六', 'liù', 'six');
insert into public.take (id, learner_id, scene_id, role_id, mode) values
  ('d0a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted'),
  ('d0b00000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted');

-- Learner A's histories (id, line, level attempted at, passed, when).
insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, created_at) values
  -- line 1: only a failure at 3 -> stays 3
  ('d0a00000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000000', 3, false, 'match', '2026-01-01 10:00'),
  -- line 2: pass at 3 -> fades to 2
  ('d0a00000-0000-0000-0000-000000000000', '10200000-0000-0000-0000-000000000000', 3, true, 'match', '2026-01-01 10:01'),
  -- line 3: pass at 3, pass at 2, pass at 1 -> 0
  ('d0a00000-0000-0000-0000-000000000000', '10300000-0000-0000-0000-000000000000', 3, true, 'match', '2026-01-01 10:02'),
  ('d0a00000-0000-0000-0000-000000000000', '10300000-0000-0000-0000-000000000000', 2, true, 'match', '2026-01-01 10:03'),
  ('d0a00000-0000-0000-0000-000000000000', '10300000-0000-0000-0000-000000000000', 1, true, 'match', '2026-01-01 10:04'),
  -- line 4: already at 0 and passes again -> stays 0 (floor)
  ('d0a00000-0000-0000-0000-000000000000', '10400000-0000-0000-0000-000000000000', 0, true, 'match', '2026-01-01 10:05'),
  -- line 5: faded to 2, then the learner raised support by hand (next attempt logged at 3) and failed -> 3
  ('d0a00000-0000-0000-0000-000000000000', '10500000-0000-0000-0000-000000000000', 3, true, 'match', '2026-01-01 10:06'),
  ('d0a00000-0000-0000-0000-000000000000', '10500000-0000-0000-0000-000000000000', 3, false, 'match', '2026-01-01 10:07'),
  -- line 6: passed at 1, then the learner flipped the verdict to a fail (self) -> 1
  ('d0a00000-0000-0000-0000-000000000000', '10600000-0000-0000-0000-000000000000', 1, true, 'match', '2026-01-01 10:08'),
  ('d0a00000-0000-0000-0000-000000000000', '10600000-0000-0000-0000-000000000000', 1, false, 'self', '2026-01-01 10:09');
-- Learner B passed line 1 once at level 3.
insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, created_at) values
  ('d0b00000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000000', 3, true, 'match', '2026-01-01 11:00');

select ok(
  (select coalesce('security_invoker=true' = any (c.reloptions), false)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'line_support'),
  'line_support is a security_invoker view, so it respects line_attempt''s row-level security');

-- Derived levels, read as the migration owner (row-level security is bypassed here).
select is(
  (select jsonb_object_agg(position::text, support_level)
     from public.line_support s join public.line l on l.id = s.line_id
    where s.learner_id = '11111111-1111-1111-1111-111111111111'),
  '{"1":3,"2":2,"3":0,"4":0,"5":3,"6":1}'::jsonb,
  'A''s levels follow: fail stays, pass fades one, floor at 0, manual raise and flipped verdict respected');
select is(
  (select attempts from public.line_support
    where learner_id = '11111111-1111-1111-1111-111111111111'
      and line_id = '10300000-0000-0000-0000-000000000000'),
  3, 'the view counts attempts per line');
select is(
  (select last_attempt_at from public.line_support
    where learner_id = '11111111-1111-1111-1111-111111111111'
      and line_id = '10300000-0000-0000-0000-000000000000'),
  '2026-01-01 10:04'::timestamptz, 'the view reports the last attempt time');
select is(
  (select support_level from public.line_support
    where learner_id = '22222222-2222-2222-2222-222222222222'
      and line_id = '10100000-0000-0000-0000-000000000000'),
  2, 'B''s history on the same line is separate from A''s');

-- Signed out.
set local role anon;
select throws_ok($$ select * from public.line_support $$, '42501', null,
  'anon cannot read the support-level view');

-- Learner A through row-level security.
reset role;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.line_support), 6,
  'A reads one row per line they have attempted');
select is((select count(distinct learner_id)::int from public.line_support), 1,
  'A''s view rows belong to one learner');
select is(
  (select support_level from public.line_support where line_id = '10100000-0000-0000-0000-000000000000'),
  3, 'A sees their own level for line 1, not B''s');

-- Learner B.
reset role;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.line_support), 1, 'B reads only their own row');
select is(
  (select support_level from public.line_support where line_id = '10100000-0000-0000-0000-000000000000'),
  2, 'B''s level for line 1 is faded');

select * from finish();
rollback;
