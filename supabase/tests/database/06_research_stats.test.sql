-- research_stats: numbers from opted-in learners only, no text, no IDs,
-- readable by the maintainer (service_role / database owner) only.
begin;
select plan(28);

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test');
-- A opts in (and has a display name); B does not.
update public.learner set research_opt_in = true, display_name = 'SECRET-NAME-A'
 where id = '11111111-1111-1111-1111-111111111111';
update public.learner set display_name = 'SECRET-NAME-B'
 where id = '22222222-2222-2222-2222-222222222222';

insert into public.scene (id, owner_id, title, show, source) values
  ('50000000-0000-0000-0000-000000000000', null, 'Test starter', 'Original', 'starter'),
  ('5a000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'SECRET-TITLE-A', 'SECRET-SHOW-A', 'paste');
insert into public.character (id, scene_id, name) values
  ('c0a00000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'Mum'),
  ('caa00000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000', 'SECRET-CHAR-A');
insert into public.line (id, scene_id, character_id, position, hanzi, pinyin, english) values
  ('10100000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 1, '一', 'yī', 'one'),
  ('10200000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 2, '二', 'èr', 'two'),
  ('1aa00000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 1, '早', 'zǎo', 'Morning');

-- A: take 1 (ended, 10 minutes, check-in 3, four attempts, three passes) and take 2 (no attempts yet).
insert into public.take (id, learner_id, scene_id, role_id, mode, started_at, ended_at, checkin, checkin_note) values
  ('d1a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted',
   '2026-02-03 09:00', '2026-02-03 09:10', 3, 'SECRET-NOTE-A'),
  ('d2a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 'scripted',
   '2026-02-04 09:00', null, null, null);
insert into public.line_attempt (take_id, line_id, support_level, heard_text, syllable_match, tone_score, passed, judged_by, hints, response_ms) values
  ('d1a00000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000000', 3, 'SECRET-HEARD-1', 1.0, 0.8, true, 'match', '{"meaning":1,"slower":0,"replay":2}', 1000),
  ('d1a00000-0000-0000-0000-000000000000', '10200000-0000-0000-0000-000000000000', 3, 'SECRET-HEARD-2', 0.5, 0.6, false, 'match', '{"meaning":0,"slower":1,"replay":0}', 3000),
  ('d1a00000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000000', 2, 'SECRET-HEARD-3', 1.0, 0.4, true, 'match', '{"meaning":0,"slower":0,"replay":0}', 2000),
  ('d1a00000-0000-0000-0000-000000000000', '10200000-0000-0000-0000-000000000000', 2, 'SECRET-HEARD-4', 0.9, 0.2, true, 'self',  '{"meaning":0,"slower":0,"replay":1}', 2000);
-- B (not opted in): one take with an attempt.
insert into public.take (id, learner_id, scene_id, role_id, mode) values
  ('d1b00000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted');
insert into public.line_attempt (take_id, line_id, support_level, heard_text, syllable_match, passed, judged_by) values
  ('d1b00000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000000', 3, 'SECRET-HEARD-B', 0.1, false, 'match');

-- Shape: numbers and categories, nothing else.
select has_view('public', 'research_stats', 'research_stats view exists');
select is(
  array(select attname::text from pg_attribute
         where attrelid = 'public.research_stats'::regclass and attnum > 0 and not attisdropped
         order by attnum),
  array['started_on', 'mode', 'improv_level', 'scene_source', 'duration_s', 'checkin',
        'attempts', 'passes', 'pass_rate', 'avg_syllable_match', 'avg_tone_score',
        'avg_support_level', 'hints_meaning', 'hints_slower', 'hints_replay', 'avg_response_ms'],
  'research_stats exposes exactly the documented columns');
select is(
  (select count(*)::int from pg_attribute
    where attrelid = 'public.research_stats'::regclass and attnum > 0 and not attisdropped
      and (atttypid in ('uuid'::regtype, 'jsonb'::regtype, 'json'::regtype, 'varchar'::regtype)
           or attname ~ '(^|_)(id|ids|uuid|text|note|name|title|show|hanzi|pinyin|english)$')),
  0, 'no column is an ID, JSON or text-bearing field by type or name');

-- Reads as the maintainer (service_role).
set local role service_role;
select is((select count(*)::int from public.research_stats), 2,
  'the maintainer sees A''s two takes and none of B''s (not opted in)');
select is(
  (select row_to_json(s)::jsonb from public.research_stats s where s.attempts = 4),
  '{"started_on":"2026-02-03","mode":"scripted","improv_level":null,"scene_source":"starter",
    "duration_s":600,"checkin":3,"attempts":4,"passes":3,"pass_rate":0.750,
    "avg_syllable_match":0.850,"avg_tone_score":0.500,"avg_support_level":2.500,
    "hints_meaning":1,"hints_slower":1,"hints_replay":3,"avg_response_ms":2000}'::jsonb,
  'a take''s counts, rates, levels and timings are summarised correctly');
select is(
  (select row_to_json(s)::jsonb from public.research_stats s where s.attempts = 0),
  '{"started_on":"2026-02-04","mode":"scripted","improv_level":null,"scene_source":"paste",
    "duration_s":null,"checkin":null,"attempts":0,"passes":0,"pass_rate":null,
    "avg_syllable_match":null,"avg_tone_score":null,"avg_support_level":null,
    "hints_meaning":0,"hints_slower":0,"hints_replay":0,"avg_response_ms":null}'::jsonb,
  'a take with no attempts yet is counted with zero hints and null averages');
select ok(
  not exists (select 1 from public.research_stats s
               where s::text ~ '(SECRET|11111111|22222222|d1a00000|d2a00000|d1b00000)'),
  'no row carries any text, display name, note, title or ID');
reset role;

-- Learner-controlled values can't make the view fail for the maintainer.
-- Every number the view casts or sums is bounded by a constraint.
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ update public.take set ended_at = '294000-01-01' where id = 'd2a00000-0000-0000-0000-000000000000' $$,
  '23514', null, 'a take cannot end absurdly long after it started');
select throws_ok(
  $$ update public.take set ended_at = started_at + interval '25 hours' where id = 'd2a00000-0000-0000-0000-000000000000' $$,
  '23514', null, 'a take is capped at 24 hours');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":1e30,"slower":0,"replay":0}') $$,
  '23514', null, 'a hint count cannot be huge');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"x":1}') $$,
  '23514', null, 'hints must have meaning, slower and replay');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":1,"slower":0}') $$,
  '23514', null, 'a missing hints key is rejected');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":1,"slower":0,"replay":0,"extra":1}') $$,
  '23514', null, 'an extra hints key is rejected');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":1.5,"slower":0,"replay":0}') $$,
  '23514', null, 'hint counts are whole numbers');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":-1,"slower":0,"replay":0}') $$,
  '23514', null, 'hint counts are not negative');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":"5","slower":0,"replay":0}') $$,
  '23514', null, 'hint counts are numbers, not strings');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, response_ms)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match', 3600001) $$,
  '23514', null, 'a response time is capped at an hour');
-- The largest values the constraints allow still summarise.
select lives_ok(
  $$ update public.take set ended_at = started_at + interval '24 hours' where id = 'd2a00000-0000-0000-0000-000000000000' $$,
  'a take can last the full 24 hours');
select lives_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by, hints, response_ms)
     values ('d2a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, true, 'match',
             '{"meaning":1000,"slower":1000,"replay":1000}', 3600000) $$,
  'maximum hint counts and response time are accepted');
reset role;
set local role service_role;
select lives_ok($$ select * from public.research_stats $$,
  'research_stats still works for the maintainer at the largest allowed values');
select ok(
  (select hints_meaning = 1000 and hints_slower = 1000 and hints_replay = 1000
          and duration_s = 86400 and avg_response_ms = 3600000
     from public.research_stats where attempts = 1),
  'the extreme take summarises exactly');
reset role;

-- Not readable by signed-out or ordinary signed-in users.
set local role anon;
select throws_ok($$ select * from public.research_stats $$, '42501', null,
  'anon cannot read research_stats');
reset role;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from public.research_stats $$, '42501', null,
  'an opted-in learner cannot read research_stats either');
reset role;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from public.research_stats $$, '42501', null,
  'an ordinary signed-in learner cannot read research_stats');
reset role;

-- No writes through the view.
select is(
  array(select privilege_type::text from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'research_stats'
           and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
         order by 1),
  array['SELECT'],
  'the only grant on research_stats is SELECT, to service_role');
select is(
  (select grantee::text from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'research_stats'
      and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')),
  'service_role', 'and that grant is to service_role alone');

-- Opting out takes a learner out of the view at once.
update public.learner set research_opt_in = false
 where id = '11111111-1111-1111-1111-111111111111';
set local role service_role;
select is((select count(*)::int from public.research_stats), 0,
  'a learner who opts out disappears from research_stats');
reset role;

-- Opting in is per learner: B opting in adds B's take only.
update public.learner set research_opt_in = true
 where id = '22222222-2222-2222-2222-222222222222';
set local role service_role;
select is((select count(*)::int from public.research_stats), 1,
  'B opting in adds B''s single take');
reset role;

select * from finish();
rollback;
