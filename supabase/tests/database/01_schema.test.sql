-- Schema shape, privileges and the learner row created for every auth user.
begin;
select plan(26);

-- The six tables in docs/mvp.md "Data".
select has_table('public', 'learner', 'learner table exists');
select has_table('public', 'scene', 'scene table exists');
select has_table('public', 'character', 'character table exists');
select has_table('public', 'line', 'line table exists');
select has_table('public', 'take', 'take table exists');
select has_table('public', 'line_attempt', 'line_attempt table exists');

select columns_are('public', 'learner',
  array['id', 'display_name', 'speech_pref', 'research_opt_in', 'created_at'],
  'learner has the documented columns');
select columns_are('public', 'scene',
  array['id', 'owner_id', 'title', 'show', 'source', 'created_at'],
  'scene has the documented columns');
select columns_are('public', 'take',
  array['id', 'learner_id', 'scene_id', 'role_id', 'mode', 'improv_level',
        'started_at', 'ended_at', 'checkin', 'checkin_note'],
  'take has the documented columns');
select columns_are('public', 'line_attempt',
  array['id', 'take_id', 'line_id', 'support_level', 'variation_text',
        'heard_text', 'syllable_match', 'tone_score', 'passed', 'judged_by',
        'hints', 'response_ms', 'created_at'],
  'line_attempt has the documented columns plus created_at for ordering');

-- Row-level security is on, and forced, for every table in public.
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity) = 6,
  'all six tables have row-level security enabled and forced');
select ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  'no table in public lacks forced row-level security');

-- Explicit grants: signed-out users get SELECT on starter-content tables only.
select is(
  array(select table_name || ':' || privilege_type
          from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public'
         order by 1),
  array['character:SELECT', 'line:SELECT', 'scene:SELECT'],
  'anon can only SELECT scene, character and line');
select is(
  array(select table_name || ':' || privilege_type
          from information_schema.role_table_grants
         where grantee = 'authenticated' and table_schema = 'public'
           and table_name in ('take', 'line_attempt', 'learner')
           and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
         order by 1),
  array[]::text[],
  'authenticated cannot delete or truncate learner, take or line_attempt');
select is(
  array(select privilege_type::text
          from information_schema.role_table_grants
         where grantee = 'authenticated' and table_schema = 'public'
           and table_name = 'line_attempt'
         order by 1),
  array['SELECT'],
  'authenticated has table-level SELECT only on line_attempt (INSERT is per column)');
select ok(
  has_column_privilege('authenticated', 'public.line_attempt', 'passed', 'insert')
  and not has_column_privilege('authenticated', 'public.line_attempt', 'created_at', 'insert')
  and not has_any_column_privilege('authenticated', 'public.line_attempt', 'update'),
  'authenticated can insert attempt answers but not created_at, and update nothing');
select ok(
  has_column_privilege('authenticated', 'public.take', 'role_id', 'insert')
  and not has_column_privilege('authenticated', 'public.take', 'started_at', 'insert')
  and not has_column_privilege('authenticated', 'public.take', 'ended_at', 'insert'),
  'authenticated cannot set take timestamps at insert');

-- Functions are private by default: a new function in public is not executable
-- by PUBLIC, anon or authenticated until someone grants it.
create function public.zz_probe() returns int language sql as 'select 1';
select ok(
  not has_function_privilege('anon', 'public.zz_probe()', 'execute')
  and not has_function_privilege('authenticated', 'public.zz_probe()', 'execute'),
  'a new function in public is not executable by anon or authenticated');
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and (has_function_privilege('anon', p.oid, 'execute')
                      or has_function_privilege('authenticated', p.oid, 'execute'))),
  'no function in public is executable by anon or authenticated');

-- The signup trigger.
select has_function('public', 'handle_new_user', 'handle_new_user exists');
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prosecdef
                 and not coalesce(p.proconfig::text like '%search_path=%', false)),
  'every security definer function in public locks its search_path');
select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'signed-in and signed-out users cannot call handle_new_user directly');

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test');

select is(
  (select count(*)::int from public.learner where id = '11111111-1111-1111-1111-111111111111'),
  1, 'a learner row is created for each new auth user');
select is(
  (select research_opt_in from public.learner where id = '11111111-1111-1111-1111-111111111111'),
  false, 'research_opt_in defaults to false');

select throws_ok(
  $$ insert into public.scene (owner_id, title, source) values (null, 'x', 'paste') $$,
  '23514', null, 'a scene with no owner must be a starter scene');
select throws_ok(
  $$ insert into public.scene (owner_id, title, source)
     values ('11111111-1111-1111-1111-111111111111', 'x', 'starter') $$,
  '23514', null, 'an owned scene cannot claim to be a starter scene');

select * from finish();
rollback;
