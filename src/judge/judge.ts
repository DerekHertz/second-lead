import { type Syllable, syllablesFromHanzi, syllablesFromPinyin, withoutTrailingParticles } from './syllables'

/**
 * The share of a line's syllables that must match for a Pass: the length of the longer of the
 * expected and heard lines, less the syllables that were wrong, missing or added, over that length.
 * At 0.8 a 5-syllable line allows one slip, a 10-syllable line two, and a 2-syllable line none.
 */
export const PASS_THRESHOLD = 0.8

/** Who decided the verdict: the syllable match, or the learner overriding it. */
export type JudgedBy = 'match' | 'self'

/**
 * The verdict on one spoken line. Field names are the `line_attempt` columns they are logged in.
 * `syllable_match` and `tone_score` are 0..1; `tone_score` never decides `passed`.
 */
export type Verdict = {
  heard_text: string
  syllable_match: number
  tone_score: number
  passed: boolean
  judged_by: JudgedBy
}

/** A scripted line: its characters and, preferred over reading them, its authored pinyin. */
export type ExpectedLine = { hanzi: string; pinyin?: string }

/** What the learner does with a verdict: take it, say it was misheard, or flip it. */
export type Review = 'accept' | 'misheard' | 'flip'

/** Two syllables sound the same when their toneless sounds are, or one is a numeral's second reading. */
function sameSound(a: Syllable, b: Syllable): boolean {
  return a.base === b.base || a.alias === b.base || b.alias === a.base
}

type Pair = { expected: number; heard: number }

/** Align two syllable lists by toneless sound (insert, drop or swap one syllable at cost 1). */
function align(expected: Syllable[], heard: Syllable[]): { errors: number; matched: Pair[] } {
  const n = expected.length
  const m = heard.length
  const cost: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = 0; i <= n; i++) cost[i]![0] = i
  for (let j = 0; j <= m; j++) cost[0]![j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = sameSound(expected[i - 1]!, heard[j - 1]!)
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + (same ? 0 : 1),
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1,
      )
    }
  }
  const matched: Pair[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const same = sameSound(expected[i - 1]!, heard[j - 1]!)
    if (cost[i]![j] === cost[i - 1]![j - 1]! + (same ? 0 : 1)) {
      if (same) matched.push({ expected: i - 1, heard: j - 1 })
      i--
      j--
    } else if (cost[i]![j] === cost[i - 1]![j]! + 1) i--
    else j--
  }
  return { errors: cost[n]![m]!, matched: matched.reverse() }
}

// The tones a syllable takes when it is said in running speech.
const BU_TONES = new Set([2, 4])
const YI_TONES = new Set([1, 2, 4])

/** Whether the tone heard is right for the one expected, allowing for 不, 一 and third-tone sandhi. */
function toneRight(expected: Syllable, heard: Syllable, next: Syllable | undefined): boolean {
  if (expected.base !== heard.base) return true // 二 for 两: no tone to compare
  if (expected.tone === heard.tone) return true
  if (expected.base === 'bu' && BU_TONES.has(expected.tone) && BU_TONES.has(heard.tone)) return true
  if (expected.base === 'yi' && YI_TONES.has(expected.tone) && YI_TONES.has(heard.tone)) return true
  return expected.tone === 2 && heard.tone === 3 && next?.tone === 3
}

/** The share of matched syllables said in the right tone; a neutral tone is not held against anyone. */
function toneScore(expected: Syllable[], heard: Syllable[], matched: Pair[]): number {
  if (matched.length === 0) return 0
  const scored = matched.filter((p) => expected[p.expected]!.tone !== 0)
  if (scored.length === 0) return 1
  const right = scored.filter((p) => toneRight(expected[p.expected]!, heard[p.heard]!, expected[p.expected + 1]))
  return right.length / scored.length
}

function expectedSyllables(line: ExpectedLine): Syllable[] {
  const authored = line.pinyin?.trim() ? syllablesFromPinyin(line.pinyin) : null
  return authored ?? syllablesFromHanzi(line.hanzi)
}

/**
 * Judge what speech recognition heard against the expected line. Both sides become toneless
 * pinyin syllables (punctuation, spaces, digits and Latin letters are dropped, a final particle
 * and the erhua 儿 are optional), are aligned, and pass when the match reaches PASS_THRESHOLD.
 * The tone score is reported alongside and never decides the pass.
 */
export function judgeLine(expected: ExpectedLine, heardText: string): Verdict {
  const want = withoutTrailingParticles(expectedSyllables(expected))
  const got = withoutTrailingParticles(syllablesFromHanzi(heardText))
  if (want.length === 0 || got.length === 0) {
    return { heard_text: heardText, syllable_match: 0, tone_score: 0, passed: false, judged_by: 'match' }
  }
  const longest = Math.max(want.length, got.length)
  const { errors, matched } = align(want, got)
  const syllable_match = (longest - errors) / longest
  return {
    heard_text: heardText,
    syllable_match,
    tone_score: toneScore(want, got, matched),
    passed: syllable_match >= PASS_THRESHOLD,
    judged_by: 'match',
  }
}

/** The learner flips a verdict either way: it stands as their own call, not the matcher's. */
export function flipVerdict(verdict: Verdict): Verdict {
  return { ...verdict, passed: !verdict.passed, judged_by: 'self' }
}

/**
 * What a verdict becomes once the learner has reviewed it: the attempt to log, or null when it
 * was misheard (the learner retries the line and nothing is logged).
 */
export function settleAttempt(verdict: Verdict, review: Review): Verdict | null {
  if (review === 'misheard') return null
  return review === 'flip' ? flipVerdict(verdict) : verdict
}
