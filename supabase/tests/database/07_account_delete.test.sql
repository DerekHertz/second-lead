-- Deleting a learner (their auth user) removes every row they own, including
-- append-only line attempts and imported scenes, and nothing of anyone else's.
begin;
select plan(14);

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
insert into public.take (id, learner_id, scene_id, role_id, mode) values
  ('d0a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 'scripted'),
  ('d1a00000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 'scripted'),
  ('d0b00000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '5b000000-0000-0000-0000-000000000000', 'cba00000-0000-0000-0000-000000000000', 'scripted');
insert into public.line_attempt (take_id, line_id, support_level, passed, judged_by) values
  ('d0a00000-0000-0000-0000-000000000000', '10a00000-0000-0000-0000-000000000000', 3, true, 'match'),
  ('d1a00000-0000-0000-0000-000000000000', '1aa00000-0000-0000-0000-000000000000', 3, false, 'match'),
  ('d0b00000-0000-0000-0000-000000000000', '1ba00000-0000-0000-0000-000000000000', 3, true, 'match');

select is(
  (select count(*)::int from public.learner where id = '11111111-1111-1111-1111-111111111111'),
  1, 'before: A has a learner row');

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select is((select count(*)::int from public.learner where id = '11111111-1111-1111-1111-111111111111'),
  0, 'A''s learner row is gone');
select is((select count(*)::int from public.scene where owner_id = '11111111-1111-1111-1111-111111111111'),
  0, 'A''s imported scenes are gone');
select is((select count(*)::int from public.character where scene_id = '5a000000-0000-0000-0000-000000000000'),
  0, 'A''s imported characters are gone');
select is((select count(*)::int from public.line where scene_id = '5a000000-0000-0000-0000-000000000000'),
  0, 'A''s imported lines are gone');
select is((select count(*)::int from public.take where learner_id = '11111111-1111-1111-1111-111111111111'),
  0, 'A''s takes are gone');
select is((select count(*)::int from public.line_attempt
            where take_id in ('d0a00000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000000')),
  0, 'A''s append-only line attempts are gone');

-- Everyone else's data survives.
select is((select count(*)::int from public.learner where id = '22222222-2222-2222-2222-222222222222'),
  1, 'B''s learner row remains');
select is((select count(*)::int from public.scene where id = '5b000000-0000-0000-0000-000000000000'),
  1, 'B''s scene remains');
select is((select count(*)::int from public.take where id = 'd0b00000-0000-0000-0000-000000000000'),
  1, 'B''s take remains');
select is((select count(*)::int from public.line_attempt where take_id = 'd0b00000-0000-0000-0000-000000000000'),
  1, 'B''s line attempt remains');
select is((select count(*)::int from public.scene where id = '50000000-0000-0000-0000-000000000000'),
  1, 'the starter scene remains');
select is((select count(*)::int from public.line where scene_id = '50000000-0000-0000-0000-000000000000'),
  1, 'the starter scene''s lines remain');

-- A second account deletion with learners holding no data is also fine.
select lives_ok($$ delete from auth.users where id = '22222222-2222-2222-2222-222222222222' $$,
  'B''s account deletes cleanly too');

select * from finish();
rollback;
