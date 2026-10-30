# MVP

What the first version of Second Lead is, decided in the kickoff grilling on 2026-10-29. Terms are defined in [CONTEXT.md](../CONTEXT.md). Decisions that are hard to reverse are in [adr/](adr/).

## Who and what

- **First learner:** the maintainer. Mandarin only, around HSK 1–2, English native, reads pinyin with some characters.
- **Purpose:** a personal experiment that is publicly usable from a link and grows into a product. Measurement focuses on the maintainer; anyone can sign in and use it.

## The practice loop

- The learner plays one **role** in a **scene**. The AI speaks the other characters' **lines**.
- Each line shows characters with pinyin above every word, plus English. Tapping a word gives its gloss.
- **Support level** is per line and computed from the learner's line-attempt history (no stored progress). Levels, from most to least help: characters + pinyin + English → characters + pinyin → English meaning only → nothing.
- **Fading:** a line drops a level after a pass. The learner can always raise or lower support by hand.
- **Hints** (meaning, slower audio, replay) are one tap away at every level and are counted.
- **Pass (scripted lines):** fuzzy match of toneless pinyin syllables between what speech recognition heard and the line. Tones are scored separately as feedback and never block a pass.
- **Overrides:** "it misheard me" retries the line without logging an attempt; after an attempt the learner can flip the verdict either way, logged as a self-judgment.
- **Improv** unlocks when most lines are faded, in three levels unlocked in order: **Paraphrase** (scripted reply still fits), **Swap** (a changed detail needs a matching change), **Branch** (a short detour that steers back). From Swap on, the AI judges whether the reply fits the meaning.

## Tone tools

In the MVP: slowed and isolated playback (line, word or syllable), tone colors on pinyin, record-and-compare, and a pitch contour of the learner's recording over the target. Stretch: per-syllable tone scoring (Azure pronunciation assessment), original show audio clips.

## Scenes

- **Starter scenes:** two short originals written for the app, both HSK 1–2, about 8–12 lines, two characters:
  - **Family dinner:** a parent pushes food and asks about love life and work; the kid deflects.
  - **Taxi:** asking for directions and being late.
  Each needs a native-speaker naturalness check and a hand-written variation set for improv testing.
- **Import:** paste raw text (the AI splits lines, guesses speakers, adds pinyin and English) or upload `.srt`/`.ass`/`.vtt`. A review screen lets the learner fix it. Imported scenes are private to the learner who imported them and never shared.

## AI and speech

- **Text AI:** Sign in with ChatGPT (Responses API on the learner's own Plus/Pro plan). Plays characters, structures imports, explains lines, judges improv. See [ADR 0001](adr/0001-chatgpt-login-for-text-browser-speech-by-default.md).
- **Token custody:** the refresh token is held server-side, encrypted; the browser gets short-lived access tokens and calls OpenAI directly. See [ADR 0002](adr/0002-split-chatgpt-token-custody.md).
- **Speech:** behind one provider interface (synthesize, recognize, optionally assess). Browser Web Speech by default; optional OpenAI API key (browser-only) for better voices; Azure Speech for the maintainer's own use only.

## Stack

Vite + React + TypeScript progressive web app ([ADR 0003](adr/0003-web-first-pwa-native-later.md)); Supabase for auth, Postgres, row-level security, Vault and Edge Functions (the ChatGPT OAuth callback and token refresh live there); frontend on Cloudflare Pages or Vercel, chosen at first deploy. Supported: desktop and Android Chrome. Native shell later.

## Data

```
learner        id (= auth user) · display_name · speech_pref · research_opt_in · created_at
scene          id · owner_id (null = starter) · title · show · source (starter|paste|subtitle) · created_at
character      id · scene_id · name
line           id · scene_id · character_id · position · hanzi · pinyin · english
take           id · learner_id · scene_id · role_id → character · mode (scripted|improv)
               improv_level (paraphrase|swap|branch) · started_at · ended_at · checkin (1–4) · checkin_note
line_attempt   id · take_id · line_id · support_level · variation_text (null if scripted)
               heard_text · syllable_match · tone_score · passed · judged_by (match|ai|self)
               hints {meaning, slower, replay} · response_ms
```

Support level and improv unlock are views over `line_attempt`. Recordings stay in the browser.

## Security and privacy

| Data | Read | Write |
|---|---|---|
| Starter scenes, their characters and lines | everyone, signed out too | migrations only |
| Imported scenes | the owner | the owner |
| Takes and line attempts | the learner | the learner, append-only |
| Research stats view | the maintainer | none (opt-in learners only, no text, no IDs) |

Deleting an account removes all of the learner's rows. ChatGPT refresh tokens live in Supabase Vault and never reach the browser. Nothing secret goes in an AI prompt, since prompts are visible in the client.

## Build order

Each slice is usable on its own.

1. **Scene loop:** starter scenes, role choice, browser TTS/STT, pass by syllable match, per-line fading, hints, overrides.
2. **Accounts and data:** Supabase auth, schema, row-level security, takes and line attempts synced, check-in, progress view.
3. **ChatGPT login and AI:** sign-in with split token custody, line explanations, import by paste and subtitle file with review.
4. **Tone tools:** slowed and isolated playback, tone colors, record-and-compare, pitch contour.
5. **Improv:** paraphrase, swap, branch; AI judging from swap on.
6. **Public polish:** research stats opt-in, iOS notice, hosting, optional OpenAI voices, Azure for the maintainer.

## Stretch

Transfer probe, per-syllable tone scoring, original show audio, fading per word, native shell (Capacitor or Expo), open conversation in improv.

## Out of scope

Shared or public scene library, other languages, paying for learners' AI usage, storing learners' voice recordings on a server.
