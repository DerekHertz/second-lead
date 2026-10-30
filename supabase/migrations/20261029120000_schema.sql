-- Second Lead schema, as in docs/mvp.md "Data".
--
-- Ownership and deletion: everything a learner owns hangs off auth.users by
-- ON DELETE CASCADE (auth.users -> learner -> scene/take -> character/line/
-- line_attempt), so deleting the auth user removes every row they own.
-- Cascades run with the table owner's rights, so they are not blocked by the
-- append-only rules on line_attempt (see 20261029120100_rls.sql).

create table public.learner (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  speech_pref text not null default 'browser'
    check (speech_pref in ('browser', 'openai', 'azure')),
  research_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.scene (
  id uuid primary key default gen_random_uuid(),
  -- null = starter scene (written by migrations only); otherwise an imported scene
  owner_id uuid references public.learner (id) on delete cascade,
  title text not null,
  show text,
  source text not null check (source in ('starter', 'paste', 'subtitle')),
  created_at timestamptz not null default now(),
  constraint scene_owner_matches_source check ((owner_id is null) = (source = 'starter'))
);
create index scene_owner_id_idx on public.scene (owner_id);

create table public.character (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scene (id) on delete cascade,
  name text not null,
  -- lets line and take reference "a character of this scene" with a composite key
  constraint character_scene_id_id_key unique (scene_id, id)
);

create table public.line (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scene (id) on delete cascade,
  character_id uuid not null,
  position integer not null check (position > 0),
  hanzi text not null,
  pinyin text not null,
  english text not null,
  constraint line_scene_position_key unique (scene_id, position),
  -- a line's speaker belongs to the line's scene
  constraint line_character_in_scene_fkey foreign key (scene_id, character_id)
    references public.character (scene_id, id) on delete cascade
);

create table public.take (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learner (id) on delete cascade,
  scene_id uuid not null references public.scene (id) on delete cascade,
  role_id uuid not null,
  mode text not null check (mode in ('scripted', 'improv')),
  improv_level text check (improv_level in ('paraphrase', 'swap', 'branch')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  checkin smallint check (checkin between 1 and 4),
  checkin_note text,
  constraint take_improv_level_matches_mode check ((mode = 'improv') = (improv_level is not null)),
  -- ended_at is learner-updatable and feeds research_stats' duration, so it is bounded
  constraint take_ended_after_started check (
    ended_at is null or (ended_at >= started_at and ended_at <= started_at + interval '24 hours')),
  -- the role is a character of the take's scene
  constraint take_role_in_scene_fkey foreign key (scene_id, role_id)
    references public.character (scene_id, id) on delete cascade
);
create index take_learner_id_idx on public.take (learner_id, started_at);
create index take_scene_role_idx on public.take (scene_id, role_id);

-- created_at is not in docs/mvp.md; it orders a line's attempt history, which
-- the support-level view needs (clock_timestamp() so same-transaction inserts still order).
create table public.line_attempt (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.take (id) on delete cascade,
  line_id uuid not null references public.line (id) on delete cascade,
  -- 3 = characters + pinyin + English, 2 = characters + pinyin, 1 = English only, 0 = nothing
  support_level smallint not null check (support_level between 0 and 3),
  variation_text text, -- null when the line was scripted
  heard_text text,
  syllable_match numeric(4, 3) check (syllable_match between 0 and 1),
  tone_score numeric(4, 3) check (tone_score between 0 and 1),
  passed boolean not null,
  judged_by text not null check (judged_by in ('match', 'ai', 'self')),
  -- counts of hints used on this line
  hints jsonb not null default '{"meaning": 0, "slower": 0, "replay": 0}'::jsonb,
  response_ms integer check (response_ms between 0 and 3600000), -- at most an hour
  created_at timestamptz not null default clock_timestamp(),
  -- exactly meaning, slower, replay: each a whole number from 0 to 1000. Every
  -- learner-supplied number that research_stats sums or casts is bounded, so the
  -- view cannot overflow for the maintainer.
  constraint line_attempt_hints_shape check (
    jsonb_typeof(hints) = 'object'
    and hints - 'meaning' - 'slower' - 'replay' = '{}'::jsonb
    and jsonb_path_exists(hints,
      '$ ? (@.meaning.type() == "number" && @.meaning >= 0 && @.meaning <= 1000 && @.meaning == @.meaning.floor()
         && @.slower.type() == "number" && @.slower >= 0 && @.slower <= 1000 && @.slower == @.slower.floor()
         && @.replay.type() == "number" && @.replay >= 0 && @.replay <= 1000 && @.replay == @.replay.floor())')
  )
);
create index line_attempt_take_idx on public.line_attempt (take_id);
create index line_attempt_line_idx on public.line_attempt (line_id, created_at);
