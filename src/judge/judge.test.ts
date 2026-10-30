import { describe, expect, it } from 'vitest'
import family from '../../content/scenes/family-dinner.json'
import taxi from '../../content/scenes/taxi.json'
import { starterScenes } from '../scenes'
import { PASS_THRESHOLD, flipVerdict, judgeLine, settleAttempt } from './judge'

// A 12-syllable line assembled from the family-dinner scene (no final particle).
const LONG = '我天天都好好吃饭妈你别说'

describe('Pass: the right sound with the wrong character', () => {
  it('passes when speech recognition picked a homophone character', () => {
    // 马 (mǎ) for 妈 (mā), 作 (zuò) for 左 (zuǒ): same toneless syllable, different character.
    const verdict = judgeLine({ hanzi: '妈，这个鱼真好吃！' }, '马这个鱼真好吃')
    expect(verdict.passed).toBe(true)
    expect(verdict.syllable_match).toBe(1)

    expect(judgeLine({ hanzi: '我走左边的路' }, '我走作边的路').passed).toBe(true)
  })

  it('ignores punctuation, spaces and Latin noise on both sides', () => {
    const verdict = judgeLine({ hanzi: '您好，去哪儿？' }, ' 您好 hello, 去哪儿 ！')
    expect(verdict.passed).toBe(true)
    expect(verdict.syllable_match).toBe(1)
  })

  it('keeps what was heard, untouched, on the verdict', () => {
    expect(judgeLine({ hanzi: '你好' }, ' 你好! ').heard_text).toBe(' 你好! ')
  })
})

describe('Pass: the threshold', () => {
  it('is one named constant, a fraction of syllables that must match', () => {
    expect(PASS_THRESHOLD).toBeGreaterThan(0)
    expect(PASS_THRESHOLD).toBeLessThan(1)
  })

  it('fails exactly when wrong syllables take the match below the threshold', () => {
    const syllables = [...LONG]
    let passes = 0
    let fails = 0
    for (let wrong = 0; wrong <= syllables.length; wrong++) {
      // 猫 (mao) is a sound that is nowhere in the line.
      const heard = syllables.map((ch, i) => (i < wrong ? '猫' : ch)).join('')
      const verdict = judgeLine({ hanzi: LONG }, heard)
      const expectedMatch = (syllables.length - wrong) / syllables.length
      expect(verdict.syllable_match).toBeCloseTo(expectedMatch, 10)
      expect(verdict.passed).toBe(expectedMatch >= PASS_THRESHOLD)
      if (verdict.passed) passes++
      else fails++
    }
    // The threshold actually bites in both directions.
    expect(passes).toBeGreaterThan(1)
    expect(fails).toBeGreaterThan(1)
  })

  it('lets one dropped syllable through in a long line', () => {
    const verdict = judgeLine({ hanzi: LONG }, LONG.slice(0, 5) + LONG.slice(6))
    expect(verdict.passed).toBe(true)
    expect(verdict.syllable_match).toBeLessThan(1)
  })

  it('fails a short line with a missing or wrong syllable', () => {
    expect(judgeLine({ hanzi: '你好' }, '你').passed).toBe(false)
    expect(judgeLine({ hanzi: '你好' }, '你们').passed).toBe(false)
  })

  it('fails a line with syllables missing from the middle once enough are gone', () => {
    const verdict = judgeLine({ hanzi: LONG }, '我天天都好好')
    expect(verdict.passed).toBe(false)
  })

  it('counts syllables that were added as errors too', () => {
    const verdict = judgeLine({ hanzi: '你好' }, '你好吃饭了吗')
    expect(verdict.syllable_match).toBeLessThan(1)
    expect(verdict.passed).toBe(false)
  })

  it('fails syllables said in the wrong order', () => {
    const verdict = judgeLine({ hanzi: '我最喜欢的人就是你' }, '你是就人的欢喜最我')
    expect(verdict.passed).toBe(false)
    expect(verdict.syllable_match).toBeLessThan(PASS_THRESHOLD)
  })

  it('fails when nothing was heard', () => {
    for (const heard of ['', '   ', '?!', 'hello']) {
      const verdict = judgeLine({ hanzi: '你好' }, heard)
      expect(verdict.passed).toBe(false)
      expect(verdict.syllable_match).toBe(0)
      expect(verdict.tone_score).toBe(0)
      expect(verdict.judged_by).toBe('match')
    }
  })

  it('does not pass a line that has no syllables to match', () => {
    expect(judgeLine({ hanzi: '...' }, '').passed).toBe(false)
  })
})

describe('Tones: scored beside the match, never blocking it', () => {
  it('scores 1 when every tone is right', () => {
    expect(judgeLine({ hanzi: '你好' }, '你好').tone_score).toBe(1)
  })

  it('passes a line whose every tone is off, and reports the tone score separately', () => {
    // 尼 (ní) 豪 (háo): the sounds nǐ hǎo with both tones wrong.
    const verdict = judgeLine({ hanzi: '你好' }, '尼豪')
    expect(verdict.passed).toBe(true)
    expect(verdict.syllable_match).toBe(1)
    expect(verdict.tone_score).toBe(0)
  })

  it('scores the share of matched syllables whose tone is right', () => {
    // 马 (mǎ) for 妈 (mā) is the only wrong tone among the 9 syllables.
    const verdict = judgeLine({ hanzi: '妈，这个鱼真好吃！' }, '马这个鱼真好吃')
    expect(verdict.passed).toBe(true)
    expect(verdict.tone_score).toBeGreaterThan(0)
    expect(verdict.tone_score).toBeLessThan(1)
  })

  it('stays between 0 and 1', () => {
    for (const heard of ['', '你好', '尼豪', '你们', '猫猫猫猫猫']) {
      const { tone_score, syllable_match } = judgeLine({ hanzi: '你好' }, heard)
      expect(tone_score).toBeGreaterThanOrEqual(0)
      expect(tone_score).toBeLessThanOrEqual(1)
      expect(syllable_match).toBeGreaterThanOrEqual(0)
      expect(syllable_match).toBeLessThanOrEqual(1)
    }
  })

  it('does not mark a neutral-tone syllable wrong whatever tone was heard', () => {
    // authored neutral "ma" (吗); 妈 (mā) is said in its place mid-line, tone 1 against neutral
    const verdict = judgeLine({ hanzi: '好吗好', pinyin: 'hǎo ma hǎo' }, '好妈好')
    expect(verdict.passed).toBe(true)
    expect(verdict.tone_score).toBe(1)
  })

  it('treats 不 and 一 changing tone before another syllable as right', () => {
    const verdict = judgeLine({ hanzi: '火车不会等我', pinyin: 'huǒchē bú huì děng wǒ' }, '火车不会等我')
    expect(verdict.tone_score).toBe(1)
    const yi = judgeLine({ hanzi: '第一个', pinyin: 'dì yī ge' }, '第一个')
    expect(yi.tone_score).toBe(1)
  })

  it('treats the third tone before another third tone as sandhi, not a mistake', () => {
    const verdict = judgeLine({ hanzi: '你好', pinyin: 'ní hǎo' }, '你好')
    expect(verdict.tone_score).toBe(1)
  })
})

describe('Pass: sounds that need care', () => {
  it('matches ü and v, in authored pinyin and in converted characters', () => {
    expect(judgeLine({ hanzi: '女朋友', pinyin: 'nǚpéngyou' }, '女朋友').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '女朋友', pinyin: 'nvpengyou' }, '女朋友').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '绿', pinyin: 'lü' }, '绿').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '去' }, '去').syllable_match).toBe(1)
  })

  it('treats erhua alike whether or not 儿 is heard or written', () => {
    expect(judgeLine({ hanzi: '您好，去哪儿？', pinyin: 'nín hǎo, qù nǎr?' }, '您好去哪儿').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '您好，去哪儿？', pinyin: 'nín hǎo, qù nǎr?' }, '您好去哪').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '一点儿吗' }, '一点吗').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '一点儿吗' }, '一点儿吗').syllable_match).toBe(1)
  })

  it('keeps 儿 that is a syllable of its own', () => {
    expect(judgeLine({ hanzi: '我的女儿' }, '我的女').syllable_match).toBeLessThan(1)
    expect(judgeLine({ hanzi: '儿子' }, '子').syllable_match).toBeLessThan(1)
  })

  it('does not fail a line for a sentence-final particle that was added or dropped', () => {
    expect(judgeLine({ hanzi: '我问你呢' }, '我问你').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '好' }, '好啊').passed).toBe(true)
    expect(judgeLine({ hanzi: '你去哪儿' }, '你去哪儿呢').passed).toBe(true)
    expect(judgeLine({ hanzi: '这个鱼真好吃啊' }, '这个鱼真好吃吧').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '我知道了', pinyin: 'wǒ zhīdao le' }, '我知道').syllable_match).toBe(1)
  })

  it('does not strip a particle character from the middle of a line', () => {
    expect(judgeLine({ hanzi: '你呢你' }, '你你').syllable_match).toBeLessThan(1)
  })

  it('does not strip down to nothing', () => {
    expect(judgeLine({ hanzi: '吗' }, '').passed).toBe(false)
    expect(judgeLine({ hanzi: '吗' }, '吗').passed).toBe(true)
  })
})

describe('Pass: polyphonic characters are read in context, on both sides', () => {
  it('reads 行 as háng in 银行 and as xíng in 行走', () => {
    expect(judgeLine({ hanzi: '银行' }, '因杭').syllable_match).toBe(1) // yīn háng
    expect(judgeLine({ hanzi: '行走' }, '形走').syllable_match).toBe(1) // xíng zǒu
    expect(judgeLine({ hanzi: '银行' }, '形走').passed).toBe(false)
  })

  it('reads 了 as le after a verb and liǎo in 了解, 长 as zhǎng or cháng by word', () => {
    expect(judgeLine({ hanzi: '我吃了饭' }, '我吃乐饭').syllable_match).toBe(1) // wǒ chī le fàn
    expect(judgeLine({ hanzi: '了解' }, '料解').syllable_match).toBe(1) // liào jiě
    expect(judgeLine({ hanzi: '长大' }, '涨大').syllable_match).toBe(1) // zhǎng dà
    expect(judgeLine({ hanzi: '很长' }, '很常').syllable_match).toBe(1) // hěn cháng
  })

  it('prefers the authored pinyin to converting the characters', () => {
    // Converted alone, 长 reads cháng; the authored pinyin says zhǎng.
    expect(judgeLine({ hanzi: '长', pinyin: 'zhǎng' }, '涨').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '长', pinyin: 'zhǎng' }, '长').syllable_match).toBe(0)
    expect(judgeLine({ hanzi: '长' }, '涨').syllable_match).toBe(0)
  })

  it('splits authored pinyin written word by word, with punctuation', () => {
    const line = { hanzi: '火车站有两个门，您去哪个门？', pinyin: 'huǒchēzhàn yǒu liǎng ge mén, nín qù nǎge mén?' }
    expect(judgeLine(line, '火车站有两个门您去哪个门').syllable_match).toBe(1)
  })

  it('falls back to converting the characters when the authored pinyin is not pinyin', () => {
    const verdict = judgeLine({ hanzi: '你好', pinyin: 'xyzzy qqq' }, '你好')
    expect(verdict.passed).toBe(true)
    expect(verdict.syllable_match).toBe(1)
  })
})

describe('Pass: the starter scenes', () => {
  const lines = [...taxi.lines, ...family.lines]

  it.each(lines.map((l) => [l.id, l] as const))('%s passes when said as written', (_id, line) => {
    const verdict = judgeLine({ hanzi: line.hanzi, pinyin: line.pinyin }, line.hanzi)
    expect(verdict.syllable_match).toBe(1)
    expect(verdict.passed).toBe(true)
    expect(verdict.tone_score).toBe(1)
  })

  it.each(lines.map((l) => [l.id, l] as const))('%s passes on characters alone, too', (_id, line) => {
    const verdict = judgeLine({ hanzi: line.hanzi }, line.hanzi)
    expect(verdict.syllable_match).toBe(1)
    expect(verdict.tone_score).toBe(1)
  })

  it('fails a different line from the same scene', () => {
    for (const line of lines) {
      const other = lines.find((l) => l.id !== line.id && l.hanzi.length > 6)!
      expect(judgeLine({ hanzi: line.hanzi, pinyin: line.pinyin }, other.hanzi).passed).toBe(false)
    }
  })
})

describe('Pass: every scripted line said as written, authored pinyin or not', () => {
  const wordFormLines = starterScenes.flatMap((s) =>
    s.lines.map((l, i) => ({
      id: `words-${s.id}-${i + 1}`,
      hanzi: l.words.map((w) => w.hanzi).join(''),
      pinyin: l.words.map((w) => w.pinyin).join(' '),
    })),
  )
  const all = [...taxi.lines, ...family.lines, ...wordFormLines]

  it.each(all.map((l) => [l.id, l] as const))('%s: its characters against its own authored pinyin', (_id, line) => {
    const verdict = judgeLine({ hanzi: line.hanzi, pinyin: line.pinyin }, line.hanzi)
    expect(verdict.syllable_match).toBe(1)
    expect(verdict.passed).toBe(true)
  })
})

describe('Pass: words that look like a final particle but are not', () => {
  it('keeps the second syllable of reduplicated kinship words, from authored pinyin and from characters', () => {
    expect(judgeLine({ hanzi: '妈妈。', pinyin: 'māma' }, '妈妈').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '爸爸', pinyin: 'bàba' }, '爸爸').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '吃了，妈妈。', pinyin: 'chī le māma' }, '吃了妈妈').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '爸爸' }, '爸爸').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '奶奶、爷爷', pinyin: 'nǎinai, yéye' }, '奶奶爷爷').syllable_match).toBe(1)
  })

  it('does not let half of a reduplicated word pass for the whole word', () => {
    expect(judgeLine({ hanzi: '妈妈', pinyin: 'māma' }, '妈').passed).toBe(false)
    expect(judgeLine({ hanzi: '妈妈' }, '妈').passed).toBe(false)
    expect(judgeLine({ hanzi: '吃了，妈妈。', pinyin: 'chī le māma' }, '吃了妈').passed).toBe(false)
  })

  it('treats a final particle alike from authored pinyin and from characters', () => {
    for (const [hanzi, pinyin, said] of [
      ['你好吗', 'nǐ hǎo ma', '你好'],
      ['你好', undefined, '你好吗'],
      ['好吧', 'hǎo ba', '好'],
      ['我问你呢', 'wǒ wèn nǐ ne', '我问你'],
      ['我问你', undefined, '我问你呢'],
    ] as const) {
      expect(judgeLine({ hanzi, pinyin }, said).syllable_match).toBe(1)
    }
  })
})

describe('Pass: numerals in what was heard', () => {
  it('reads Arabic numerals as the Chinese numbers they stand for', () => {
    expect(judgeLine({ hanzi: '三点了' }, '3点了').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '东门到了，三十块。' }, '东门到了，30块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '十点', pinyin: 'shí diǎn' }, '10点').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '十二点' }, '12点').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '二十二块' }, '22块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '一百块' }, '100块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '一百零五块' }, '105块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '一百一十块' }, '110块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '三千五百块' }, '3500块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '三十块', pinyin: 'sānshí kuài' }, '30块').syllable_match).toBe(1)
  })

  it('reads a long or zero-led number digit by digit, like a phone number', () => {
    expect(judgeLine({ hanzi: '一二三四五' }, '12345').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '零零七' }, '007').syllable_match).toBe(1)
  })

  it('accepts 二 or 两 for a 2 that stands alone or leads a hundred or thousand', () => {
    for (const hanzi of ['我要二个', '我要两个']) {
      expect(judgeLine({ hanzi }, '我要2个').syllable_match).toBe(1)
    }
    expect(judgeLine({ hanzi: '两百块' }, '200块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '二百块' }, '200块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '两千块' }, '2000块').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '我要两个', pinyin: 'wǒ yào liǎng ge' }, '我要2个').tone_score).toBe(1)
  })

  it('does not accept 两 for the 2 in 二十, nor a different number', () => {
    expect(judgeLine({ hanzi: '两十块' }, '20块').syllable_match).toBeLessThan(1)
    expect(judgeLine({ hanzi: '三十块' }, '20块').passed).toBe(false)
    expect(judgeLine({ hanzi: '三十块' }, '3块').passed).toBe(false)
  })
})

describe('Tones: only neutral syllables matched', () => {
  it('scores 1, since a neutral tone is not held against anyone', () => {
    // 妈 (mā) said where only a neutral-tone 吗 is expected: nothing to score, nothing wrong.
    const verdict = judgeLine({ hanzi: '吗' }, '妈')
    expect(verdict.passed).toBe(true)
    expect(verdict.tone_score).toBe(1)
  })
})

describe('Authored pinyin with the erhua r set apart', () => {
  it('reads "zhè r" as zhè with an erhua suffix', () => {
    // Converted from the characters 长 would read cháng; only the authored zhǎng matches 涨.
    expect(judgeLine({ hanzi: '长儿', pinyin: 'zhǎng r' }, '涨').syllable_match).toBe(1)
    expect(judgeLine({ hanzi: '这儿', pinyin: 'zhè r' }, '这儿').syllable_match).toBe(1)
  })
})

describe('Verdict: who judged it', () => {
  it('is judged by match when it comes from the matcher', () => {
    expect(judgeLine({ hanzi: '你好' }, '你好').judged_by).toBe('match')
    expect(judgeLine({ hanzi: '你好' }, '').judged_by).toBe('match')
  })

  it('flips a pass to a fail, judged by self', () => {
    const flipped = flipVerdict(judgeLine({ hanzi: '你好' }, '你好'))
    expect(flipped.passed).toBe(false)
    expect(flipped.judged_by).toBe('self')
  })

  it('flips a fail to a pass, judged by self', () => {
    const flipped = flipVerdict(judgeLine({ hanzi: '你好' }, ''))
    expect(flipped.passed).toBe(true)
    expect(flipped.judged_by).toBe('self')
  })

  it('keeps the numbers and what was heard when flipped, and leaves the original alone', () => {
    const verdict = judgeLine({ hanzi: '你好' }, '尼豪')
    const flipped = flipVerdict(verdict)
    expect(flipped.syllable_match).toBe(verdict.syllable_match)
    expect(flipped.tone_score).toBe(verdict.tone_score)
    expect(flipped.heard_text).toBe(verdict.heard_text)
    expect(verdict.passed).toBe(true)
    expect(verdict.judged_by).toBe('match')
  })

  it('stays judged by self when flipped back', () => {
    const back = flipVerdict(flipVerdict(judgeLine({ hanzi: '你好' }, '你好')))
    expect(back.passed).toBe(true)
    expect(back.judged_by).toBe('self')
  })
})

describe('Overrides: settling an attempt', () => {
  const verdict = judgeLine({ hanzi: '你好' }, '你好')

  it('"misheard, retry" produces no attempt', () => {
    expect(settleAttempt(verdict, 'misheard')).toBeNull()
    expect(settleAttempt(judgeLine({ hanzi: '你好' }, ''), 'misheard')).toBeNull()
  })

  it('keeps the matcher verdict as the attempt when the learner accepts it', () => {
    expect(settleAttempt(verdict, 'accept')).toEqual(verdict)
  })

  it('logs a flipped verdict as the attempt, judged by self', () => {
    const attempt = settleAttempt(verdict, 'flip')
    expect(attempt).toEqual(flipVerdict(verdict))
    expect(attempt?.judged_by).toBe('self')
  })
})
