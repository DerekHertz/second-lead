-- Local development seed: ONE small fixture starter scene (owner_id null).
-- Seeding the real starter scenes from content/scenes/*.json comes later, with
-- that content (issue #2). Idempotent; runs as the database owner, which is
-- the only way starter rows are written.
insert into public.scene (id, owner_id, title, show, source) values
  ('00000000-0000-4000-8000-000000000001', null, 'Family dinner (fixture)', 'Original', 'starter')
on conflict (id) do nothing;

insert into public.character (id, scene_id, name) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '妈妈'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', '小明')
on conflict (id) do nothing;

insert into public.line (id, scene_id, character_id, position, hanzi, pinyin, english) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, '你吃饭了吗？', 'nǐ chī fàn le ma?', 'Have you eaten?'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 2, '吃了，妈妈。', 'chī le, māma.', 'I have, Mum.'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 3, '再吃一点儿吧！', 'zài chī yì diǎnr ba!', 'Eat a little more!'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 4, '我真的饱了。', 'wǒ zhēn de bǎo le.', 'I''m really full.'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 5, '你有女朋友了吗？', 'nǐ yǒu nǚ péngyou le ma?', 'Do you have a girlfriend yet?'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 6, '妈妈，我们吃饭吧。', 'māma, wǒmen chī fàn ba.', 'Mum, let''s just eat.')
on conflict (id) do nothing;
