-- Takes and line attempts: private to the learner, ownership chains enforced,
-- line attempts append-only.
begin;
select plan(28);

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test');
insert into public.scene (id, owner_id, title, show, source) values
  ('50000000-0000-0000-0000-000000000000', null, 'Test starter', 'Original', 'starter'),
  ('5a000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'A import', 'Show A', 'paste'),
  ('5b000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'B import', 'Show B', 'subtitle');
insert into public.character (id, scene_id, name) values
  ('c0a00000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'Mum'),
  ('caa00000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000', 'A1'),
  ('cba00000-0000-0000-0000-000000000000', '5b000000-0000-0000-0000-000000000000', 'B1');
insert into public.line (id, scene_id, character_id, position, hanzi, pinyin, english) values
  ('10a00000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 1, '你好', 'nǐ hǎo', 'Hello'),
  ('1aa00000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 1, '早', 'zǎo', 'Morning'),
  ('1ba00000-0000-0000-0000-000000000000', '5b000000-0000-0000-0000-000000000000', 'cba00000-0000-0000-0000-000000000000', 1, '晚', 'wǎn', 'Evening');
-- A has a take on the starter scene with one attempt; B has a take on B's own scene with one attempt.
insert into public.take (id, learner_id, scene_id, role_id, mode) values
  ('d0a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted'),
  ('d0b00000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '5b000000-0000-0000-0000-000000000000', 'cba00000-0000-0000-0000-000000000000', 'scripted');
insert into public.line_attempt (id, take_id, line_id, support_level, heard_text, syllable_match, passed, judged_by) values
  ('a0a00000-0000-0000-0000-000000000000', 'd0a00000-0000-0000-0000-000000000000', '10a00000-0000-0000-0000-000000000000', 3, 'ni hao', 1.0, true, 'match'),
  ('a0b00000-0000-0000-0000-000000000000', 'd0b00000-0000-0000-0000-000000000000', '1ba00000-0000-0000-0000-000000000000', 3, 'wan', 0.5, false, 'match');

-- Signed out: nothing.
set local role anon;
select throws_ok($$ select * from public.take $$, '42501', null, 'anon cannot read takes');
select throws_ok($$ select * from public.line_attempt $$, '42501', null, 'anon cannot read line attempts');
select throws_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode)
     values ('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted') $$,
  '42501', null, 'anon cannot insert a take');

-- Learner A.
reset role;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(array(select id from public.take order by id),
  array['d0a00000-0000-0000-0000-000000000000'::uuid], 'A sees only their own takes');
select is(array(select id from public.line_attempt order by id),
  array['a0a00000-0000-0000-0000-000000000000'::uuid], 'A sees only their own line attempts');

-- Takes: ownership chain.
select lives_ok(
  $$ insert into public.take (id, learner_id, scene_id, role_id, mode)
     values ('d1a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 'scripted') $$,
  'A can start a take on their own imported scene');
select lives_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode, improv_level)
     values ('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'improv', 'paraphrase') $$,
  'A can start a take on a starter scene');
select throws_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode)
     values ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000000', 'cba00000-0000-0000-0000-000000000000', 'scripted') $$,
  '42501', null, 'A cannot start a take on B''s imported scene');
select throws_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode)
     values ('22222222-2222-2222-2222-222222222222', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted') $$,
  '42501', null, 'A cannot create a take owned by B');
select throws_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode)
     values ('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 'scripted') $$,
  '23503', null, 'a take''s role must be a character of the take''s scene');
select throws_ok(
  $$ insert into public.take (learner_id, scene_id, role_id, mode, improv_level)
     values ('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted', 'swap') $$,
  '23514', null, 'a scripted take has no improv level');
select throws_ok(
  $$ update public.take set checkin = 5 where id = 'd0a00000-0000-0000-0000-000000000000' $$,
  '23514', null, 'check-in is 1 to 4');
select lives_ok(
  $$ update public.take set ended_at = now(), checkin = 4, checkin_note = 'fun'
      where id = 'd0a00000-0000-0000-0000-000000000000' $$,
  'A can end and check in on their own take');
select lives_ok(
  $$ update public.take set checkin = 1 where id = 'd0b00000-0000-0000-0000-000000000000' $$,
  'A tries to update B''s take; effect checked below');
select throws_ok(
  $$ update public.take set learner_id = '22222222-2222-2222-2222-222222222222'
      where id = 'd0a00000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot reassign a take to B');
select throws_ok(
  $$ delete from public.take where id = 'd0a00000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot delete a take');

-- Line attempts: append-only, ownership chain.
select lives_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, heard_text, syllable_match, passed, judged_by)
     values ('d0a00000-0000-0000-0000-000000000000', '10a00000-0000-0000-0000-000000000000', 2, 'ni hao', 0.9, true, 'self') $$,
  'A can append a line attempt to their own take');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by)
     values ('d0b00000-0000-0000-0000-000000000000', '1ba00000-0000-0000-0000-000000000000', 2, true, 'match') $$,
  '42501', null, 'A cannot append an attempt to B''s take');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by)
     values ('d0a00000-0000-0000-0000-000000000000', '1ba00000-0000-0000-0000-000000000000', 2, true, 'match') $$,
  '42501', null, 'an attempt''s line must belong to the take''s scene');
select throws_ok(
  $$ update public.line_attempt set passed = true where id = 'a0a00000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot update a line attempt');
select throws_ok(
  $$ delete from public.line_attempt where id = 'a0a00000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot delete a line attempt');
select throws_ok(
  $$ truncate public.line_attempt $$,
  '42501', null, 'A cannot truncate line attempts');

-- Learner B sees none of A's rows.
reset role;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select is(array(select id from public.take order by id),
  array['d0b00000-0000-0000-0000-000000000000'::uuid], 'B sees only their own takes');
select is(array(select id from public.line_attempt order by id),
  array['a0b00000-0000-0000-0000-000000000000'::uuid], 'B sees only their own line attempts');
select throws_ok(
  $$ insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by)
     values ('d0a00000-0000-0000-0000-000000000000', '10a00000-0000-0000-0000-000000000000', 2, true, 'match') $$,
  '42501', null, 'B cannot append an attempt to A''s take');

-- A's data is unchanged.
reset role;
select is(
  (select count(*)::int from public.line_attempt where take_id = 'd0a00000-0000-0000-0000-000000000000'),
  2, 'A''s attempts are exactly the two that were appended');
select is(
  (select checkin from public.take where id = 'd0a00000-0000-0000-0000-000000000000'),
  4::smallint, 'A''s check-in stuck');
select is(
  (select checkin from public.take where id = 'd0b00000-0000-0000-0000-000000000000'),
  null, 'B''s take is untouched');

select * from finish();
rollback;
