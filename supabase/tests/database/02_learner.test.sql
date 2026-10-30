-- A learner can read and update only their own learner row, and not change id.
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test');

-- Signed out.
set local role anon;
select throws_ok($$ select * from public.learner $$, '42501', null,
  'anon cannot read learners');

-- Learner A.
reset role;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  array(select id from public.learner),
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'A sees only their own learner row');
select is(
  (select count(*)::int from public.learner where id = '22222222-2222-2222-2222-222222222222'),
  0, 'A cannot read B''s learner row');

update public.learner set display_name = 'Alice', research_opt_in = true, speech_pref = 'browser'
 where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name || ':' || research_opt_in::text from public.learner),
  'Alice:true', 'A can update display_name, speech_pref and research_opt_in');

select lives_ok(
  $$ update public.learner set display_name = 'hacked'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  'A tries to update B''s learner row; effect checked below');
select throws_ok(
  $$ update public.learner set id = '33333333-3333-3333-3333-333333333333'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their learner id');
select throws_ok(
  $$ insert into public.learner (id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'A cannot insert learner rows (the signup trigger does)');
select throws_ok(
  $$ delete from public.learner where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot delete the learner row directly (deleting the account does)');

reset role;
select is(
  (select display_name from public.learner where id = '22222222-2222-2222-2222-222222222222'),
  null, 'B''s row is untouched');

select * from finish();
rollback;
