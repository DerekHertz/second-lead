import { syllablesFromPinyin } from '../judge/syllables'
import type { Line, Scene, Word } from '../scene'

/** The part of a scene file in content/scenes that the app reads (format: docs/scenes.md). */
export type SceneFile = {
  id: string
  title: string
  show?: string
  characters: { id: string; name: string }[]
  lines: { character: string; hanzi: string; pinyin: string; english: string }[]
}

const isHan = (ch: string) => /\p{Script=Han}/u.test(ch)
const TRAILING_PUNCTUATION = /[,.?!]+$/

/**
 * Cut a line's characters into the words its pinyin is written in. Each pinyin word takes as
 * many Han characters as it has syllables (plus an erhua 儿 for a written `r`); punctuation stays
 * with the word before it. A lone `r` ("zhè r") joins the word before it. Null when the pinyin
 * and the characters do not line up.
 */
function splitWords(hanzi: string, pinyin: string): Word[] | null {
  const chars = [...hanzi]
  const words: Word[] = []
  let at = 0
  const takeNonHan = () => {
    let out = ''
    while (at < chars.length && !isHan(chars[at]!)) out += chars[at++]
    return out
  }
  let lead = takeNonHan()
  for (const raw of pinyin.split(/\s+/).filter(Boolean)) {
    const written = raw.replace(TRAILING_PUNCTUATION, '')
    const syllables = syllablesFromPinyin(written)
    const previous = words[words.length - 1]
    if (/^r$/i.test(written) && previous && chars[at] === '儿') {
      previous.hanzi += chars[at++] + takeNonHan()
      previous.pinyin += ` ${written}`
      continue
    }
    if (!syllables) return null
    let word = lead
    lead = ''
    for (let n = 0; n < syllables.length; n++) {
      if (at >= chars.length || !isHan(chars[at]!)) return null
      word += chars[at++]
    }
    if (/r$/i.test(written) && chars[at] === '儿') word += chars[at++]
    word += takeNonHan()
    words.push({ hanzi: word, pinyin: written })
  }
  return at === chars.length ? words : null
}

/** A scene file as the app's Scene: characters become roles, and each line is split into words. */
export function sceneFromFile(file: SceneFile): Scene {
  return {
    id: file.id,
    title: file.title,
    show: file.show,
    roles: file.characters.map((c) => ({ id: c.id, name: c.name })),
    lines: file.lines.map(
      (l): Line => ({
        roleId: l.character,
        hanzi: l.hanzi,
        pinyin: l.pinyin,
        english: l.english,
        words: splitWords(l.hanzi, l.pinyin) ?? [{ hanzi: l.hanzi, pinyin: l.pinyin }],
      }),
    ),
  }
}
