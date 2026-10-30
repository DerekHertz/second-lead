-- Privileges and row-level security, per docs/mvp.md "Security and privacy".
--
-- Layers, from the outside in:
--   1. Privileges: nothing by default for anon/authenticated; explicit grants
--      below, column-level where a column must stay immutable.
--   2. Row-level security: enabled AND forced on every table. Policies only
--      allow what the mvp.md table allows.
--   3. Foreign keys carry the ownership chain that policies cannot express
--      row-locally (a line's speaker and a take's role are characters of the
--      right scene).
-- service_role and the migration owner bypass row-level security by design.

-- New objects in public start with no access for the API roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Functions are private until granted: PostgreSQL grants EXECUTE to PUBLIC on
-- every new function, which a per-schema entry cannot remove, so this is global
-- for objects the migration owner creates. A function meant for the API needs an
-- explicit `grant execute`; a security definer function is never callable by accident.
alter default privileges revoke execute on functions from public;

revoke all on all tables in schema public from anon, authenticated;

alter table public.learner enable row level security;
alter table public.scene enable row level security;
alter table public.character enable row level security;
alter table public.line enable row level security;
alter table public.take enable row level security;
alter table public.line_attempt enable row level security;

alter table public.learner force row level security;
alter table public.scene force row level security;
alter table public.character force row level security;
alter table public.line force row level security;
alter table public.take force row level security;
alter table public.line_attempt force row level security;

-- learner: read and update your own row; the signup trigger creates it; the
-- account (auth.users) deletion removes it. id and created_at never change.
grant select on public.learner to authenticated;
grant update (display_name, speech_pref, research_opt_in) on public.learner to authenticated;

create policy learner_select_own on public.learner
  for select to authenticated
  using (id = (select auth.uid()));
create policy learner_update_own on public.learner
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- scene: starter scenes (owner_id null) are readable by everyone and writable
-- by migrations only (no write policy matches a null owner). Imported scenes
-- belong to their owner. owner_id and source never change after insert.
grant select on public.scene to anon;
grant select, delete on public.scene to authenticated;
grant insert (id, owner_id, title, show, source) on public.scene to authenticated;
grant update (title, show) on public.scene to authenticated;

create policy scene_select_starter on public.scene
  for select to anon
  using (owner_id is null);
create policy scene_select_visible on public.scene
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy scene_insert_own on public.scene
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy scene_update_own on public.scene
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy scene_delete_own on public.scene
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- character and line: follow their scene.
grant select on public.character, public.line to anon;
grant select, insert, update, delete on public.character, public.line to authenticated;

create policy character_select_starter on public.character
  for select to anon
  using (exists (select 1 from public.scene s where s.id = character.scene_id and s.owner_id is null));
create policy character_select_visible on public.character
  for select to authenticated
  using (exists (
    select 1 from public.scene s
     where s.id = character.scene_id
       and (s.owner_id is null or s.owner_id = (select auth.uid()))));
create policy character_write_own on public.character
  for all to authenticated
  using (exists (
    select 1 from public.scene s
     where s.id = character.scene_id and s.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.scene s
     where s.id = character.scene_id and s.owner_id = (select auth.uid())));

create policy line_select_starter on public.line
  for select to anon
  using (exists (select 1 from public.scene s where s.id = line.scene_id and s.owner_id is null));
create policy line_select_visible on public.line
  for select to authenticated
  using (exists (
    select 1 from public.scene s
     where s.id = line.scene_id
       and (s.owner_id is null or s.owner_id = (select auth.uid()))));
create policy line_write_own on public.line
  for all to authenticated
  using (exists (
    select 1 from public.scene s
     where s.id = line.scene_id and s.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.scene s
     where s.id = line.scene_id and s.owner_id = (select auth.uid())));

-- take: the learner reads their own, starts takes on a starter scene or their
-- own scene, and may only set ended_at and the check-in afterwards. No delete.
grant select on public.take to authenticated;
-- started_at is the server's clock; ended_at is set afterwards by update
grant insert (id, learner_id, scene_id, role_id, mode, improv_level) on public.take to authenticated;
grant update (ended_at, checkin, checkin_note) on public.take to authenticated;

create policy take_select_own on public.take
  for select to authenticated
  using (learner_id = (select auth.uid()));
create policy take_insert_own on public.take
  for insert to authenticated
  with check (
    learner_id = (select auth.uid())
    and exists (
      select 1 from public.scene s
       where s.id = take.scene_id
         and (s.owner_id is null or s.owner_id = (select auth.uid()))));
create policy take_update_own on public.take
  for update to authenticated
  using (learner_id = (select auth.uid()))
  with check (learner_id = (select auth.uid()));

-- line_attempt: append-only for its learner. Insert and select only: no
-- update or delete privilege and no such policy. The insert policy checks
-- the whole chain: the take is the caller's and the line is in the take's scene.
-- created_at (the history order) is the server's clock, not the learner's
grant select on public.line_attempt to authenticated;
grant insert (id, take_id, line_id, support_level, variation_text, heard_text, syllable_match,
              tone_score, passed, judged_by, hints, response_ms)
  on public.line_attempt to authenticated;

create policy line_attempt_select_own on public.line_attempt
  for select to authenticated
  using (exists (
    select 1 from public.take t
     where t.id = line_attempt.take_id and t.learner_id = (select auth.uid())));
create policy line_attempt_insert_own on public.line_attempt
  for insert to authenticated
  with check (exists (
    select 1
      from public.take t
      join public.line l on l.scene_id = t.scene_id
     where t.id = line_attempt.take_id
       and l.id = line_attempt.line_id
       and t.learner_id = (select auth.uid())));
