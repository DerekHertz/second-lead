-- Views over line_attempt.

-- line_support: each learner's current support level per line, derived from
-- their attempt history (no stored progress, docs/mvp.md "Data").
--
-- Levels: 3 = characters + pinyin + English, 2 = characters + pinyin,
-- 1 = English only, 0 = nothing.
-- Rule: take the learner's latest attempt on the line. If it passed, the line
-- has faded one level below the level it was attempted at (floor 0); if not,
-- it stays at that level. A manual raise or lower is the support_level logged
-- on the next attempt, so it takes effect through the history. A flipped
-- verdict is the logged `passed` (judged_by = 'self'). A line with no attempts
-- has no row: the client treats it as level 3.
--
-- security_invoker: the view runs with the caller's rights, so line_attempt's
-- and take's row-level security still limits each learner to their own rows.
create view public.line_support
with (security_invoker = true) as
select
  learner_id,
  scene_id,
  line_id,
  (case when passed then greatest(support_level - 1, 0) else support_level end)::int as support_level,
  attempts,
  last_attempt_at
from (
  select
    t.learner_id,
    t.scene_id,
    a.line_id,
    a.support_level,
    a.passed,
    row_number() over w as rn,
    (count(*) over (partition by t.learner_id, a.line_id))::int as attempts,
    max(a.created_at) over (partition by t.learner_id, a.line_id) as last_attempt_at
  from public.line_attempt a
  join public.take t on t.id = a.take_id
  window w as (partition by t.learner_id, a.line_id order by a.created_at desc, a.id desc)
) latest
where rn = 1;

revoke all on public.line_support from public, anon, authenticated;
grant select on public.line_support to authenticated;

-- research_stats: anonymous practice numbers, one row per take, for learners
-- who opted in (learner.research_opt_in). Counts, rates, levels and timings
-- only: no text columns (no heard_text, variation_text, checkin_note, hanzi,
-- titles, names) and no IDs (no learner, take, scene or line id), and the
-- start time is cut to a day.
--
-- Deliberately NOT security_invoker: it must read every opted-in learner's
-- rows, which row-level security forbids to any one learner. It runs with its
-- owner's rights instead, so the restriction is the opt-in filter in the view
-- and a SELECT grant to service_role alone. Learners (anon and authenticated)
-- have no privilege on it; the maintainer reads it with the service-role key
-- or as the database owner. Nobody can write through it.
create view public.research_stats as
select
  (t.started_at at time zone 'UTC')::date as started_on,
  t.mode,
  t.improv_level,
  s.source as scene_source,
  round(extract(epoch from (t.ended_at - t.started_at)))::int as duration_s,
  t.checkin,
  count(a.id)::int as attempts,
  (count(a.id) filter (where a.passed))::int as passes,
  round(count(a.id) filter (where a.passed)::numeric / nullif(count(a.id), 0), 3) as pass_rate,
  round(avg(a.syllable_match), 3) as avg_syllable_match,
  round(avg(a.tone_score), 3) as avg_tone_score,
  round(avg(a.support_level), 3) as avg_support_level,
  coalesce(sum((a.hints ->> 'meaning')::numeric), 0)::int as hints_meaning,
  coalesce(sum((a.hints ->> 'slower')::numeric), 0)::int as hints_slower,
  coalesce(sum((a.hints ->> 'replay')::numeric), 0)::int as hints_replay,
  round(avg(a.response_ms))::int as avg_response_ms
from public.take t
join public.learner l on l.id = t.learner_id and l.research_opt_in
join public.scene s on s.id = t.scene_id
left join public.line_attempt a on a.take_id = t.id
group by t.id, s.id;

revoke all on public.research_stats from public, anon, authenticated, service_role;
grant select on public.research_stats to service_role;
