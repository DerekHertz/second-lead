-- The seeded fixture starter scene (supabase/seed.sql). Applies after
-- `supabase db reset` or the first `supabase start`.
begin;
select plan(4);

select ok(
  exists (select 1 from public.scene where owner_id is null and source = 'starter'),
  'at least one starter scene is seeded');
select ok(
  not exists (select 1 from public.scene s where s.owner_id is null
               and (select count(*) from public.character c where c.scene_id = s.id) < 2),
  'every starter scene has at least two characters');
select ok(
  not exists (select 1 from public.scene s where s.owner_id is null
               and (select count(*) from public.line l where l.scene_id = s.id) < 3),
  'every starter scene has lines');
select ok(
  not exists (select 1 from public.line l join public.scene s on s.id = l.scene_id
               where s.owner_id is null
                 and (btrim(l.hanzi) = '' or btrim(l.pinyin) = '' or btrim(l.english) = '')),
  'every starter line has hanzi, pinyin and english');

select * from finish();
rollback;
