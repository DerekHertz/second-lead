import { pinyin } from 'pinyin-pro'

/**
 * One spoken syllable, as the matcher sees it: the toneless pinyin `base` (ü written v),
 * the `tone` (1–4, or 0 for neutral/unmarked) and whether it is a sentence-final `particle`
 * that may be added or dropped without failing a line. An `alias` is a second sound that
 * counts as the same syllable (a numeral read 2 may be said 二 or 两).
 */
export type Syllable = { base: string; tone: number; particle: boolean; alias?: string }

// Every toneless pinyin syllable (ü written v) that pinyin-pro reads from a CJK character,
// without the interjections m, n, ng and hng. Used to cut authored pinyin such as
// "huǒchēzhàn" into syllables.
const SYLLABLES = new Set(
  (
    'a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng ' +
    'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu ' +
    'cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo ' +
    'e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan ' +
    'guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian ' +
    'jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan ' +
    'kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan ' +
    'lun luo lv lve ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ' +
    'ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa pai pan pang pao pei pen ' +
    'peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang ' +
    'rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she ' +
    'shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan ' +
    'tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi ' +
    'xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan ' +
    'yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu ' +
    'zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo'
  ).split(' '),
)
const LONGEST_SYLLABLE = 6

// Trailing syllables that carry no content: a learner (or speech recognition) may add or drop them.
const PARTICLE_CHARS = new Set([...'啊呀哇啦呢吧吗嘛哦噢了'])
const PARTICLE_SYLLABLES = new Set(['a', 'ya', 'wa', 'la', 'ne', 'ba', 'ma', 'le', 'ou', 'o'])

// 儿 is a syllable of its own in 女儿, 儿子 and the like; anywhere else it is the erhua suffix.
const NOT_ERHUA_AFTER = new Set([...'女男孩婴幼独'])
const NOT_ERHUA_BEFORE = new Set([...'子童女'])

const TONE_OF_MARK: Record<string, number> = { '̄': 1, '́': 2, '̌': 3, '̀': 4 }
const DIAERESIS = '̈'

const DIGIT_HANZI = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const PLACE_HANZI = ['', '十', '百', '千']

/**
 * The characters a run of Arabic digits is read as, and which of them (by index) may be said 两.
 * Up to four digits it is a number (30 is 三十, 105 is 一百零五, 2000 is 两千 or 二千); anything
 * longer, or led by a zero, is read digit by digit like a phone number.
 */
function readDigits(digits: string): { chars: string[]; liang: number[] } {
  if (digits.length > 4 || (digits.length > 1 && digits.startsWith('0'))) {
    return { chars: [...digits].map((d) => DIGIT_HANZI[Number(d)]!), liang: [] }
  }
  const chars: string[] = []
  const liang: number[] = []
  let skipped = false
  for (const [i, ch] of [...digits].entries()) {
    const d = Number(ch)
    const place = digits.length - 1 - i
    if (d === 0) {
      if (digits.length === 1) chars.push('零')
      else skipped = true
      continue
    }
    if (skipped) chars.push('零')
    skipped = false
    if (d === 2 && (digits.length === 1 || place >= 2)) liang.push(chars.length)
    if (!(digits.length === 2 && i === 0 && d === 1)) chars.push(DIGIT_HANZI[d]!)
    if (PLACE_HANZI[place]) chars.push(PLACE_HANZI[place]!)
  }
  return { chars, liang }
}

/** Text as characters, Arabic numerals read out as Chinese numbers; `liang` lists the 二 that may be 两. */
function withNumeralsRead(text: string): { chars: string[]; liang: Set<number> } {
  const chars: string[] = []
  const liang = new Set<number>()
  for (const part of text.split(/(\d+)/)) {
    if (/^\d+$/.test(part)) {
      const read = readDigits(part)
      read.liang.forEach((i) => liang.add(chars.length + i))
      chars.push(...read.chars)
    } else {
      chars.push(...part)
    }
  }
  return { chars, liang }
}

/**
 * Syllables of Chinese characters, each read in the context of the characters around it.
 * Arabic numerals (which speech recognition returns for numbers) are read as Chinese numbers;
 * punctuation, spaces and Latin letters are dropped.
 */
export function syllablesFromHanzi(text: string): Syllable[] {
  const { chars: all, liang } = withNumeralsRead(text)
  const out: Syllable[] = []
  let start = 0
  while (start < all.length) {
    if (!/\p{Script=Han}/u.test(all[start]!)) {
      start++
      continue
    }
    let end = start
    while (end < all.length && /\p{Script=Han}/u.test(all[end]!)) end++
    const chars = all.slice(start, end)
    const run = chars.join('')
    let readings = pinyin(run, { type: 'array', toneType: 'num', nonZh: 'removed' })
    if (readings.length !== chars.length) {
      // A character with no reading shifted the count: read each on its own so they stay aligned.
      readings = chars.map((ch) => pinyin(ch, { type: 'array', toneType: 'num', nonZh: 'removed' })[0] ?? '')
    }
    chars.forEach((ch, i) => {
      if (ch === '儿' && i > 0 && !NOT_ERHUA_AFTER.has(chars[i - 1]!) && !NOT_ERHUA_BEFORE.has(chars[i + 1] ?? '')) return
      const m = /^([a-zü]+)(\d)?$/.exec(readings[i]!.toLowerCase())
      if (!m) return
      const base = m[1]!.replace('ü', 'v')
      const syllable: Syllable = { base, tone: Number(m[2] ?? 0) % 5, particle: PARTICLE_CHARS.has(ch) }
      if (liang.has(start + i)) syllable.alias = 'liang'
      out.push(syllable)
    })
    start = end
  }
  return out
}

/** Cut one run of toneless letters into the fewest syllables; a trailing r is an erhua suffix. */
function segment(letters: string): string[] | null {
  const n = letters.length
  const best: (number | null)[] = Array.from({ length: n + 1 }, () => null)
  const cut: number[] = Array.from({ length: n + 1 }, () => 0)
  best[0] = 0
  for (let i = 1; i <= n; i++) {
    for (let len = Math.min(LONGEST_SYLLABLE, i); len >= 1; len--) {
      const before = best[i - len]
      if (before === null || before === undefined) continue
      const piece = letters.slice(i - len, i)
      const ok = SYLLABLES.has(piece) || (piece === 'r' && i - len > 0)
      if (ok && (best[i] === null || before + 1 < best[i]!)) {
        best[i] = before + 1
        cut[i] = len
      }
    }
  }
  if (best[n] === null) return null
  const pieces: string[] = []
  for (let i = n; i > 0; i -= cut[i]!) pieces.unshift(letters.slice(i - cut[i]!, i))
  return pieces
}

/**
 * Syllables of authored pinyin ("nín hǎo, qù nǎr?", "huǒchēzhàn"). Null when it is not pinyin
 * (or holds no syllable), so the caller can fall back to reading the characters. An erhua r is
 * dropped, whether written against its syllable (nǎr) or apart (zhè r).
 */
export function syllablesFromPinyin(text: string): Syllable[] | null {
  const out: Syllable[] = []
  let letters = ''
  let tones: number[] = []
  const flush = (): boolean => {
    if (letters === '') return true
    if (letters === 'r' && out.length > 0) {
      // "zhè r": an erhua suffix set apart from its syllable
      letters = ''
      tones = []
      return true
    }
    const pieces = segment(letters)
    if (!pieces) return false
    let at = 0
    for (const piece of pieces) {
      const tone = tones.slice(at, at + piece.length).find((t) => t !== 0) ?? 0
      at += piece.length
      if (piece === 'r') continue // erhua: part of the syllable before it
      out.push({ base: piece, tone, particle: tone === 0 && PARTICLE_SYLLABLES.has(piece) })
    }
    letters = ''
    tones = []
    return true
  }
  for (const ch of text.normalize('NFD').toLowerCase()) {
    if (/[a-z]/.test(ch)) {
      letters += ch
      tones.push(0)
    } else if (ch === DIAERESIS && letters.endsWith('u')) {
      letters = letters.slice(0, -1) + 'v'
    } else if (ch in TONE_OF_MARK && letters !== '') {
      tones[tones.length - 1] = TONE_OF_MARK[ch]!
    } else if (!/[̀-ͯ]/.test(ch) && !flush()) {
      return null
    }
  }
  if (!flush() || out.length === 0) return null
  return out
}

/**
 * Drop the particles at the end of a line, keeping at least one syllable. A syllable that repeats
 * the one before it (māma, bàba) is a word, not a particle. Both sides of a comparison go through
 * here, so the same word is judged the same whether it came from characters or authored pinyin.
 */
export function withoutTrailingParticles(syllables: Syllable[]): Syllable[] {
  let end = syllables.length
  while (end > 1 && syllables[end - 1]!.particle && syllables[end - 2]!.base !== syllables[end - 1]!.base) end--
  return syllables.slice(0, end)
}
