-- Scenes, characters and lines: starter content is public and read-only,
-- imported scenes are private to their owner.
begin;
select plan(36);

-- Fixtures (as the migration owner, which bypasses row-level security).
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

-- Signed out: starter scenes, their characters and lines only.
set local role anon;
select is(
  array(select id from public.scene where id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000',
     '5b000000-0000-0000-0000-000000000000') order by id),
  array['50000000-0000-0000-0000-000000000000'::uuid],
  'anon reads the starter scene and no imported scene');
select is((select count(*)::int from public.scene where owner_id is not null), 0,
  'anon sees no scene with an owner');
select is(
  array(select id from public.character where scene_id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000') order by id),
  array['c0a00000-0000-0000-0000-000000000000'::uuid],
  'anon reads starter characters only');
select is(
  array(select id from public.line where scene_id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000') order by id),
  array['10a00000-0000-0000-0000-000000000000'::uuid],
  'anon reads starter lines only');
select throws_ok(
  $$ insert into public.scene (title, source) values ('x', 'starter') $$,
  '42501', null, 'anon cannot insert a scene');
select throws_ok(
  $$ update public.scene set title = 'x' $$, '42501', null, 'anon cannot update a scene');
select throws_ok(
  $$ delete from public.scene $$, '42501', null, 'anon cannot delete a scene');
select throws_ok(
  $$ insert into public.line (scene_id, character_id, position, hanzi, pinyin, english)
     values ('50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 9, 'x', 'x', 'x') $$,
  '42501', null, 'anon cannot insert a line');

-- Learner A.
reset role;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  array(select id from public.scene where id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000',
     '5b000000-0000-0000-0000-000000000000') order by id),
  array['50000000-0000-0000-0000-000000000000'::uuid, '5a000000-0000-0000-0000-000000000000'::uuid],
  'A reads the starter scene and their own scene, not B''s');
select is(
  array(select id from public.character where scene_id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000',
     '5b000000-0000-0000-0000-000000000000') order by id),
  array['c0a00000-0000-0000-0000-000000000000'::uuid, 'caa00000-0000-0000-0000-000000000000'::uuid],
  'A reads starter and own characters, not B''s');
select is(
  array(select id from public.line where scene_id in
    ('50000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000000',
     '5b000000-0000-0000-0000-000000000000') order by id),
  array['10a00000-0000-0000-0000-000000000000'::uuid, '1aa00000-0000-0000-0000-000000000000'::uuid],
  'A reads starter and own lines, not B''s');

-- Write isolation on scenes.
select lives_ok(
  $$ update public.scene set title = 'hacked' where id = '5b000000-0000-0000-0000-000000000000' $$,
  'A tries to update B''s scene; effect checked below');
select lives_ok(
  $$ delete from public.scene where id = '5b000000-0000-0000-0000-000000000000' $$,
  'A tries to delete B''s scene; effect checked below');
select throws_ok(
  $$ insert into public.scene (owner_id, title, source)
     values ('22222222-2222-2222-2222-222222222222', 'planted', 'paste') $$,
  '42501', null, 'A cannot create a scene owned by B');

-- Starter scenes are writable by migrations only.
select throws_ok(
  $$ insert into public.scene (owner_id, title, source) values (null, 'fake starter', 'starter') $$,
  '42501', null, 'A cannot create a starter scene');
select lives_ok(
  $$ update public.scene set title = 'hacked' where id = '50000000-0000-0000-0000-000000000000' $$,
  'A tries to update a starter scene; effect checked below');
select lives_ok(
  $$ delete from public.scene where id = '50000000-0000-0000-0000-000000000000' $$,
  'A tries to delete a starter scene; effect checked below');
select throws_ok(
  $$ update public.scene set owner_id = null, source = 'starter'
      where id = '5a000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot turn their own scene into a starter scene');
select throws_ok(
  $$ insert into public.character (scene_id, name)
     values ('50000000-0000-0000-0000-000000000000', 'intruder') $$,
  '42501', null, 'A cannot add a character to a starter scene');
select throws_ok(
  $$ insert into public.line (scene_id, character_id, position, hanzi, pinyin, english)
     values ('50000000-0000-0000-0000-000000000000', 'c0a00000-0000-0000-0000-000000000000', 9, 'x', 'x', 'x') $$,
  '42501', null, 'A cannot add a line to a starter scene');
select lives_ok(
  $$ update public.line set hanzi = 'hacked' where id = '10a00000-0000-0000-0000-000000000000' $$,
  'A tries to edit a starter line; effect checked below');
select throws_ok(
  $$ insert into public.character (scene_id, name)
     values ('5b000000-0000-0000-0000-000000000000', 'intruder') $$,
  '42501', null, 'A cannot add a character to B''s scene');
select throws_ok(
  $$ insert into public.line (scene_id, character_id, position, hanzi, pinyin, english)
     values ('5b000000-0000-0000-0000-000000000000', 'cba00000-0000-0000-0000-000000000000', 9, 'x', 'x', 'x') $$,
  '42501', null, 'A cannot add a line to B''s scene');

-- Owner writes work.
select lives_ok(
  $$ insert into public.scene (id, owner_id, title, show, source)
     values ('5a100000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'A second import', 'Show A', 'subtitle') $$,
  'A can create their own scene');
select lives_ok(
  $$ insert into public.character (id, scene_id, name)
     values ('ca100000-0000-0000-0000-000000000000', '5a100000-0000-0000-0000-000000000000', 'A2') $$,
  'A can add a character to their own scene');
select lives_ok(
  $$ insert into public.line (scene_id, character_id, position, hanzi, pinyin, english)
     values ('5a100000-0000-0000-0000-000000000000', 'ca100000-0000-0000-0000-000000000000', 1, '好', 'hǎo', 'Good') $$,
  'A can add a line to their own scene');
select lives_ok(
  $$ update public.scene set title = 'Renamed' where id = '5a100000-0000-0000-0000-000000000000' $$,
  'A can retitle their own scene');
select throws_ok(
  $$ insert into public.line (scene_id, character_id, position, hanzi, pinyin, english)
     values ('5a100000-0000-0000-0000-000000000000', 'caa00000-0000-0000-0000-000000000000', 2, 'x', 'x', 'x') $$,
  '23503', null, 'a line''s character must belong to the line''s scene');
select throws_ok(
  $$ update public.scene set source = 'subtitle' where id = '5a100000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot change the source of their scene');
select throws_ok(
  $$ update public.scene set created_at = '2000-01-01' where id = '5a100000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot change the created_at of their scene');
select throws_ok(
  $$ insert into public.scene (owner_id, title, source, created_at)
     values ('11111111-1111-1111-1111-111111111111', 'old', 'paste', '2000-01-01') $$,
  '42501', null, 'A cannot backdate a scene at insert');
select throws_ok(
  $$ update public.scene set owner_id = '22222222-2222-2222-2222-222222222222'
      where id = '5a100000-0000-0000-0000-000000000000' $$,
  '42501', null, 'A cannot hand their scene to B');
select lives_ok(
  $$ delete from public.scene where id = '5a100000-0000-0000-0000-000000000000' $$,
  'A can delete their own scene');

-- Nothing of B''s changed.
reset role;
select is(
  (select title from public.scene where id = '5b000000-0000-0000-0000-000000000000'),
  'B import', 'B''s scene is untouched');
select is(
  (select title from public.scene where id = '50000000-0000-0000-0000-000000000000'),
  'Test starter', 'the starter scene is untouched');
select is(
  (select hanzi from public.line where id = '10a00000-0000-0000-0000-000000000000'),
  '你好', 'the starter line is untouched');

select * from finish();
rollback;
