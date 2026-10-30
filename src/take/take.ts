import { flipVerdict, judgeLine, settleAttempt, type Review, type Verdict } from '../judge/judge'
import type { Scene } from '../scene'
import { NORMAL_RATE, SLOW_RATE, SpeechError, type SpeechProvider } from '../speech/provider'

/** The Hints a learner can ask for on a line. */
export type HintKind = 'meaning' | 'slower' | 'replay'
export type HintCounts = Record<HintKind, number>

/** A judged attempt at one of the learner's lines, as it would be logged. */
export type TakeAttempt = { lineIndex: number; verdict: Verdict }

/**
 * Where a take is:
 * - speaking: another character's line is being said aloud
 * - listening / typing: waiting for the learner's line, by voice or by keyboard
 * - no-input: listening ended with nothing (or failed); the learner may listen again
 * - playing: a Hint's audio is playing over the learner's line
 * - reviewing: the verdict is shown and the learner decides what to do with it
 */
export type TakePhase = 'idle' | 'speaking' | 'listening' | 'typing' | 'no-input' | 'playing' | 'reviewing' | 'done'

export type TakeState = {
  phase: TakePhase
  /** The line the take is on. */
  index: number
  /** The verdict under review (flipped if the learner flipped it); null outside `reviewing`. */
  verdict: Verdict | null
  /** Settled attempts so far, in order. A line retried has one per try. */
  attempts: TakeAttempt[]
  /** Hints asked for, per line (same order as the scene's lines). Counted here; storing them is later work. */
  hints: HintCounts[]
  input: 'voice' | 'typed'
  /** Why the take asks for typing when the learner did not choose it; null otherwise. */
  inputNote: string | null
  /** While `playing`, where the take goes back to when the audio ends; null otherwise. */
  resumeTo: Resumable | null
  /** A passing remark about what just happened (nothing heard, audio failed). */
  notice: string | null
}

export type Resumable = 'listening' | 'typing' | 'no-input' | 'reviewing'

const NO_RECOGNITION = "Speech recognition isn't available in this browser, so type what you say."
const MIC_BLOCKED = 'The microphone is blocked for this page, so type what you say.'
const NO_SYNTHESIS = "This browser can't speak aloud, so read the other characters' lines."

/** Plain words for why listening stopped; the browser's error code is not for the learner. */
function stoppedBecause(code: string): string {
  if (code === 'audio-capture') return "I couldn't find a microphone to listen with."
  if (code === 'network') return "Speech recognition couldn't reach its service."
  return 'Speech recognition stopped.'
}

/**
 * One play-through of a scene by the learner. The other characters' lines are spoken, the
 * learner's are listened for (or typed) and judged, and the learner decides what each verdict
 * becomes. All speech goes through the SpeechProvider, so a fake one runs it in a test.
 */
export class Take {
  private state: TakeState
  private readonly listeners = new Set<() => void>()
  private controller: AbortController | null = null
  private epoch = 0
  private disposed = false
  private original: Verdict | null = null
  private flipped = false
  private resume: Resumable | null = null

  constructor(private readonly options: { scene: Scene; roleId: string; provider: SpeechProvider }) {
    const canListen = options.provider.canRecognize
    this.state = {
      phase: 'idle',
      index: 0,
      verdict: null,
      attempts: [],
      hints: options.scene.lines.map(() => ({ meaning: 0, slower: 0, replay: 0 })),
      input: canListen ? 'voice' : 'typed',
      inputNote: canListen ? null : NO_RECOGNITION,
      resumeTo: null,
      notice: null,
    }
  }

  getState = (): TakeState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** Begin the take at its first line. */
  start(): void {
    this.enterLine(0)
  }

  /** Stop all speech and ignore anything still on its way. */
  dispose(): void {
    this.disposed = true
    this.controller?.abort()
    this.listeners.clear()
  }

  // -- the learner's choices ------------------------------------------------------------

  /** Take the verdict as it stands (or as flipped) and go on to the next line. */
  next(): void {
    if (this.state.phase !== 'reviewing') return
    this.settle()
    this.set({ notice: null })
    this.enterLine(this.state.index + 1)
  }

  /** Take the verdict as it stands (or as flipped) and say the same line again. */
  tryAgain(): void {
    if (this.state.phase !== 'reviewing') return
    this.settle()
    this.set({ notice: null })
    this.collect(this.state.index)
  }

  /** "It misheard me": nothing is logged and the line is tried again. */
  misheard(): void {
    if (this.state.phase !== 'reviewing' || !this.original) return
    // Nothing is logged for a misheard line: `settleAttempt(.., 'misheard')` would be null.
    this.set({ notice: null })
    this.collect(this.state.index)
  }

  /** Flip the verdict either way; flipping again puts it back. */
  flip(): void {
    if (this.state.phase !== 'reviewing' || !this.original) return
    this.flipped = !this.flipped
    this.set({ verdict: this.flipped ? flipVerdict(this.original) : this.original })
  }

  /** After nothing was heard: open the microphone again. */
  listenAgain(): void {
    if (this.state.phase !== 'no-input') return
    this.set({ notice: null })
    this.collect(this.state.index)
  }

  /** Give the answer by keyboard instead of voice. */
  typeInstead(): void {
    if (this.state.phase !== 'listening' && this.state.phase !== 'no-input') return
    this.set({ input: 'typed', inputNote: null, notice: null })
    this.collect(this.state.index)
  }

  /** Go back to answering by voice, when the provider can listen. */
  useMicrophone(): void {
    if (this.state.phase !== 'typing' || !this.options.provider.canRecognize) return
    this.set({ input: 'voice', inputNote: null })
    this.collect(this.state.index)
  }

  /** Judge a typed answer. */
  submitTyped(text: string): void {
    if (this.state.phase !== 'typing' || text.trim() === '') return
    this.judge(this.state.index, text.trim())
  }

  /**
   * Ask for a Hint on the current line. Each ask is counted, except showing the meaning again.
   * Slower and replay play the line's audio; over the learner's line they pause listening.
   */
  hint(kind: HintKind): void {
    const { phase, index, hints } = this.state
    if (phase === 'idle' || phase === 'done') return
    if (kind === 'meaning' && hints[index]!.meaning > 0) return
    this.set({
      hints: hints.map((h, i) => (i === index ? { ...h, [kind]: h[kind] + 1 } : h)),
    })
    if (kind === 'meaning') return
    if (!this.options.provider.canSynthesize) {
      this.set({ notice: NO_SYNTHESIS })
      return
    }
    const rate = kind === 'slower' ? SLOW_RATE : NORMAL_RATE
    if (phase === 'speaking') this.speak(index, rate)
    else this.playOverLearnersLine(index, rate)
  }

  // -- the flow ---------------------------------------------------------------------------

  private set(patch: Partial<TakeState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  /** Cancel whatever speech is in flight and return the token that marks the next step. */
  private begin(): { stale: () => boolean; signal: AbortSignal } {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const epoch = ++this.epoch
    return { stale: () => this.disposed || epoch !== this.epoch, signal: controller.signal }
  }

  private enterLine(index: number): void {
    this.original = null
    this.flipped = false
    this.resume = null
    this.set({ index, verdict: null })
    const line = this.options.scene.lines[index]
    if (!line) {
      this.begin()
      this.set({ phase: 'done' })
    } else if (line.roleId === this.options.roleId) {
      this.collect(index)
    } else {
      this.speak(index, NORMAL_RATE)
    }
  }

  /** Say another character's line, then go on to the next. */
  private speak(index: number, rate: number): void {
    const { stale, signal } = this.begin()
    this.set({ phase: 'speaking', index, verdict: null })
    const goOn = (error?: unknown) => {
      if (stale()) return
      if (error instanceof SpeechError && error.code !== 'aborted') this.set({ notice: NO_SYNTHESIS })
      this.enterLine(index + 1)
    }
    if (!this.options.provider.canSynthesize) return goOn(new SpeechError('unsupported'))
    this.options.provider.synthesize(this.options.scene.lines[index]!.hanzi, { rate, signal }).then(() => goOn(), goOn)
  }

  /** Wait for the learner's line: listen, or open the keyboard. */
  private collect(index: number): void {
    const { stale, signal } = this.begin()
    this.set({ index, verdict: null })
    if (this.state.input === 'typed' || !this.options.provider.canRecognize) {
      this.set({ phase: 'typing' })
      return
    }
    this.set({ phase: 'listening' })
    this.options.provider.recognize({ signal }).then(
      (heard) => {
        if (!stale()) this.judge(index, heard)
      },
      (error: unknown) => {
        if (stale()) return
        this.recognitionFailed(error)
      },
    )
  }

  private recognitionFailed(error: unknown): void {
    const code = error instanceof SpeechError ? error.code : 'failed'
    if (code === 'not-allowed' || code === 'unsupported') {
      this.set({ input: 'typed', inputNote: code === 'unsupported' ? NO_RECOGNITION : MIC_BLOCKED, phase: 'typing' })
    } else if (code === 'no-speech') {
      this.set({ phase: 'no-input', notice: "I didn't hear anything." })
    } else {
      this.set({ phase: 'no-input', notice: stoppedBecause(error instanceof Error ? error.message : '') })
    }
  }

  private judge(index: number, heard: string): void {
    const line = this.options.scene.lines[index]!
    this.original = judgeLine({ hanzi: line.hanzi, pinyin: line.pinyin }, heard)
    this.flipped = false
    this.begin()
    this.set({ phase: 'reviewing', verdict: this.original, notice: null })
  }

  /** Log the attempt as the learner left it (accepted, or flipped). */
  private settle(): void {
    if (!this.original) return
    const review: Review = this.flipped ? 'flip' : 'accept'
    const verdict = settleAttempt(this.original, review)
    if (verdict) this.set({ attempts: [...this.state.attempts, { lineIndex: this.state.index, verdict }] })
  }

  /** Play a Hint's audio over the learner's line, then go back to what the learner was doing. */
  private playOverLearnersLine(index: number, rate: number): void {
    if (this.state.phase !== 'playing') this.resume = this.state.phase as Resumable
    const resume = this.resume!
    const { stale, signal } = this.begin()
    this.set({ phase: 'playing', resumeTo: resume })
    const back = () => {
      if (stale()) return
      this.resume = null
      this.set({ resumeTo: null })
      if (resume === 'listening') this.collect(index)
      else this.set({ phase: resume })
    }
    this.options.provider.synthesize(this.options.scene.lines[index]!.hanzi, { rate, signal }).then(back, (error: unknown) => {
      if (stale()) return
      if (!(error instanceof SpeechError && error.code === 'aborted')) this.set({ notice: NO_SYNTHESIS })
      back()
    })
  }
}

export function createTake(options: { scene: Scene; roleId: string; provider: SpeechProvider }): Take {
  return new Take(options)
}
