import type { ReactNode } from 'react'
import { lineMarks, type Verdict } from '../judge/judge'
import { syllablesFromPinyin } from '../judge/syllables'
import type { Line, SupportLevel } from '../scene'

const isHan = (ch: string) => /\p{Script=Han}/u.test(ch)
const syllableCount = (w: { hanzi: string; pinyin: string }) =>
  syllablesFromPinyin(w.pinyin)?.length ?? [...w.hanzi].filter(isHan).length
const endsInPunctuation = (hanzi: string) => !isHan(hanzi.at(-1) ?? '')

/** The words of a line that hold a missed syllable (by the syllable's place in the line). */
function missedWords(line: Line, missed: number[]): Set<number> {
  const out = new Set<number>()
  let at = 0
  line.words.forEach((w, i) => {
    const n = syllableCount(w)
    if (missed.some((m) => m >= at && m < at + n)) out.add(i)
    at += n
  })
  return out
}

/** One tick per syllable, with a gap where the line pauses, so a covered line still shows its length. */
function Ticks({ line }: { line: Line }) {
  return (
    <span className="ticks">
      {line.words.flatMap((w, i) => [
        ...Array.from({ length: syllableCount(w) }, (_, k) => <i key={`${i}.${k}`} data-tick="" />),
        ...(endsInPunctuation(w.hanzi) && i < line.words.length - 1 ? [<i key={`${i}.gap`} className="gap" />] : []),
      ])}
    </span>
  )
}

const CHECK = (
  <svg viewBox="0 0 26 22" role="img" aria-label="Passed">
    <path d="M3 12 C5 13 7 15 9 18 C12 11 17 6 23 3" />
  </svg>
)

export type LinePosition = 'past' | 'now' | 'future'

type Props = {
  line: Line
  speaker: string
  position: LinePosition
  isLearners: boolean
  /** The learner's lines: how much help shows. */
  level: SupportLevel
  /** Whether what is under the slips shows (lifted by hand, or after an attempt). */
  revealed: boolean
  /** Another character's line still to be heard with "listen first" on. */
  unheard: boolean
  speaking: boolean
  /** The verdict to mark the line with, if it has one. */
  verdict: Verdict | null
  /** Lift the slip; only the line the take is on has a slip that lifts. */
  onLift: (() => void) | null
}

/** A line set interlinear, with slips over what its support level hides and pencil marks once judged. */
export function LineView({ line, speaker, position, isLearners, level, revealed, unheard, speaking, verdict, onLift }: Props) {
  const marks = verdict ? lineMarks({ hanzi: line.hanzi, pinyin: line.pinyin }, verdict.heard_text) : null
  const missed = verdict && !verdict.passed && marks ? missedWords(line, marks.missed) : new Set<number>()

  const han = (
    <div className="han" lang="zh-Hans">
      {line.words.map((w, i) => (
        <ruby key={i} className="w" data-missed={missed.has(i) || undefined}>
          {w.hanzi}
          <rt>{w.pinyin}</rt>
        </ruby>
      ))}
    </div>
  )
  const eng = (
    <div className="eng" lang="en">
      {line.english}
    </div>
  )

  /** Cover `content` with a slip; the slip lifts (a button) only on the line the take is on. */
  const slip = (content: ReactNode, name: string, face: ReactNode) => (
    <div className="part">
      <div aria-hidden="true">{content}</div>
      {onLift ? (
        <button className="slip" aria-label={`${name} (a hint)`} onClick={onLift}>
          {face}
        </button>
      ) : (
        <span className="slip" aria-hidden="true">
          {face}
        </span>
      )}
    </div>
  )
  const label = (text: string) => <span className="lab">{text}</span>

  let body: ReactNode
  if (isLearners && !revealed && level === 1) body = <>{han}{slip(eng, 'Show the meaning', label('meaning'))}</>
  else if (isLearners && !revealed && level === 2) body = <>{slip(han, 'Show the words', label('the words'))}{eng}</>
  else if (isLearners && !revealed && level === 3) body = slip(<>{han}{eng}</>, 'Show the line', <Ticks line={line} />)
  else if (!isLearners && unheard && !revealed) body = slip(<>{han}{eng}</>, 'Show their line', label('listen…'))
  else body = <>{han}{eng}</>

  return (
    <article className={`line ${position}${isLearners ? ' mine' : ''}`} data-learner={isLearners} aria-current={position === 'now' ? 'true' : undefined}>
      {verdict && marks && (
        <div className="mark">
          {verdict.passed ? (
            <>
              {CHECK}
              <div className="note">{verdict.judged_by === 'self' ? 'your call' : `tones ${marks.tones.right}/${marks.tones.of}`}</div>
            </>
          ) : (
            <div className="note big" role="img" aria-label="Not yet">
              ?
            </div>
          )}
        </div>
      )}
      <p className="speaker">
        {speaker}
        {isLearners && <span className="you">(you)</span>}
        {speaking && (
          <span className="bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </p>
      <div className="dlg">{body}</div>
      {verdict && !verdict.passed && (
        <p className="heard">
          (heard: <span lang="zh-Hans">{verdict.heard_text}</span>)
        </p>
      )}
    </article>
  )
}
