# Scenes

How a starter scene is stored as content, so the seed migration (slice 2) and the practice loop (slice 1) can read it. Terms are defined in [CONTEXT.md](../CONTEXT.md); the data model this follows is in [mvp.md](mvp.md#data).

The two starter scenes are `content/scenes/family-dinner.json` (emotional, the learner plays the kid) and `content/scenes/taxi.json` (practical, the learner plays the passenger). Both are original: no line comes from a real show.

## Scene

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Same as the file name, without `.json` |
| `title`, `show` | string | `show` says which kind of show the scene is written in the style of |
| `source` | `"starter"` | The `scene.source` column |
| `level` | `"hsk1-2"` | Vocabulary level of the scene and all its variations |
| `defaultRole` | character `id` | The role the learner plays unless they pick the other |
| `characters` | 2 × `{ id, name }` | Exactly two. `id` is a short slug used by lines; `name` is the display name |
| `lines` | 8–12 lines | In order |
| `vocabExceptions` | `{ word, reason }[]` | Words allowed outside HSK 1-2, see below. `[]` when none |

## Line

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique across all scenes (`<scene id>-<position>`) |
| `character` | character `id` | Who says it |
| `position` | integer | 1, 2, 3… with no gaps, matching array order |
| `hanzi`, `pinyin`, `english` | string | Never empty (see "Pinyin") |
| `variations` | object | Only on lines **not** spoken by `defaultRole` |

Lines alternate, so every other-character line is followed by the learner's scripted reply. That reply is what a Paraphrase keeps and a Swap or Branch has to account for.

## Variations

Every other-character line has exactly one of each, with `hanzi`, `pinyin` and `english` like a normal line. All are HSK 1-2. A variation line is spoken in place of the original, in the same voice.

- **`paraphrase`**: same meaning, different words. The scripted reply still fits.
- **`swap`**: a changed detail. `changes` says in English which detail changed. `reply` is the learner's matching line, which replaces the scripted reply and must differ from it. Later scripted lines are unchanged; the AI keeps the other character consistent.
- **`branch`**: a short detour off the script, always three turns:
  1. `detour[0]`: the original line's character, replacing the original line, steering away from it.
  2. `detour[1]`: the default role's reply. This is the new sentence the learner needs; it is not scripted elsewhere.
  3. `steerBack`: the original line's character again, returning to the topic so the learner's *next scripted line* fits. Branch turns carry a `character`.

The scripted reply that follows a Paraphrase or a Branch is the next line in `lines`; nothing is copied into the variation.

## Pinyin

Pinyin sits above every word, so `pinyin` is split into words by single spaces and each syllable lines up one-to-one with a Han character in `hanzi`.

- Lowercase throughout, including names (`běijīng`); no tone digits (`ni3`), no `v` for `ü`.
- Punctuation is attached to the end of a word, as `, . ? !` (hanzi uses `，。？！`).
- Word spaces follow the usual written word, e.g. `huǒchēzhàn`, `yí ge rén`.
- **Erhua:** 儿 is written as a trailing `r` on the previous syllable (`nǎr`, `diǎnr`) and counts as the character 儿. A real syllable 儿 stays `ér` (`nǚ'ér`). Apostrophes separate syllables where needed.
- **Neutral tone:** written without a mark. The check accepts it only for particles (的 了 吗 呢 吧 么 们 子 着 过 个 得), the listed neutral syllable of certain words (朋友 喜欢 告诉 知道 时候 漂亮 认识 休息 师傅 路上 左边 右边 那边 过去), the second half of reduplicated words (妈妈 爸爸 妹妹 谢谢 看看) and the middle 不 of A不A (是不是). Any other unmarked syllable is a missing tone mark. Add a word to `NEUTRAL_WORDS` in `validate.mjs` when a new one is needed.
- **Tone sandhi:** 不 and 一 are written as spoken: `bú` before a 4th tone, `bù` otherwise; `yí` before a 4th tone or `ge`, `yì` before the 1st to 3rd tones, `yī` alone, in numbers and after 第. Third-tone sandhi is **not** written: `nǐ hǎo`, not `ní hǎo`. The check enforces the 不 and 一 rules.
- The check cannot know whether a syllable is the right reading of its character. That is part of the native-speaker check below.

## Vocabulary

Characters must be in `content/scenes/hsk12-chars.json` (the characters of the HSK 2.0 level 1 and 2 word lists) or in a scene's `vocabExceptions`. **That list was compiled from memory and has not been checked against an official source; it needs verification.** It is a character check: it cannot see a word that uses listed characters but is itself above HSK 2 (for example 零钱, 下班, 最近, 下车; they are made of HSK 1-2 characters and are common, but worth a second look).

Each exception is `{ word, reason }`, must appear in the scene, must contain a character outside the list, and must be written in this document. Current exceptions:

| Scene | Word | Why |
|---|---|---|
| taxi | 师傅 | The everyday way to address a taxi driver. 傅 is outside HSK 1-2; "driver" or 您 alone sounds stilted |

The family dinner needs none.

## Running the check

```
timeout 120 node --test content/scenes/scenes.test.mjs
```

Zero dependencies (Node's own test runner). The checks live in `content/scenes/validate.mjs` as plain functions, so a Vitest suite can import `validateScene` later. The test covers: JSON parses; fields present, typed and known; exactly two characters; 8–12 lines; every line's character exists; positions contiguous; ids unique; hanzi/pinyin/english present; pinyin tone marks, syllable count and sandhi; a complete variation set on every other-character line and none on the default role's; the Swap and Paraphrase differ from the original; the Swap reply differs from the scripted reply; the Branch has its detour and steer-back; vocabulary within the list or an exception; every exception listed here. A final group mutates a valid scene to show each check can fail.

## Open

For the user to arrange; nothing is blocked on these.

- **Native-speaker naturalness check, `family-dinner`.** Ask a native speaker whether a parent and adult kid would really say these. Look at: 这个鱼 (vs 这条鱼), 你 (vs 您) from kid to mom, 我和你爸都希望你有个家, 少来, 说着玩儿, and the matchmaking line 我朋友的女儿很漂亮. Also the variations: 手机给我看看, 不给不给, 你最喜欢的人是谁.
- **Native-speaker naturalness check, `taxi`.** Look at: 您好，去哪儿？, 路上车不多的话, 我的火车不等人, 我听您的, 东门/西门, the fare of 三十块, and the variations 您有零钱吗, 不太认识路, 您是不是第一次来这儿.
- **Verify `hsk12-chars.json`** against the official HSK level 1-2 lists and replace it if it differs.
- **Verify the pinyin readings** (tones on each character) as part of the checks above; the test cannot.
