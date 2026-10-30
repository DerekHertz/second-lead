import {
  NORMAL_RATE,
  SpeechError,
  type RecognizeOptions,
  type SpeechErrorCode,
  type SpeechProvider,
  type SynthesizeOptions,
} from './provider'

type Scripted = string | { error: SpeechErrorCode; message?: string }

/**
 * A scripted speech provider for tests: no microphone, no audio. `spoken` records every
 * synthesize call. Recognition answers from the `heard` queue (a string, or an error code),
 * and once that is empty waits until the test calls `hear` or `failListening`. With
 * `holdSynthesis`, `synthesize` stays pending (audio "playing") until the test calls
 * `finishSpeaking`; an abort ends it as a real engine would.
 */
export class FakeSpeechProvider implements SpeechProvider {
  readonly canSynthesize: boolean
  readonly canRecognize: boolean
  readonly spoken: { text: string; rate: number }[] = []
  /** How many times `recognize` has been called. */
  listenCount = 0
  /** Whether a `recognize` call is waiting for the learner. */
  listening = false
  private readonly queue: Scripted[]
  private readonly holdSynthesis: boolean
  private readonly playing = new Set<() => void>()
  private pending: { resolve: (text: string) => void; reject: (error: SpeechError) => void } | null = null

  constructor(options: { canSynthesize?: boolean; canRecognize?: boolean; heard?: Scripted[]; holdSynthesis?: boolean } = {}) {
    this.holdSynthesis = options.holdSynthesis ?? false
    this.canSynthesize = options.canSynthesize ?? true
    this.canRecognize = options.canRecognize ?? true
    this.queue = [...(options.heard ?? [])]
  }

  synthesize(text: string, options: SynthesizeOptions = {}): Promise<void> {
    if (!this.canSynthesize) return Promise.reject(new SpeechError('unsupported'))
    if (options.signal?.aborted) return Promise.reject(new SpeechError('aborted'))
    this.spoken.push({ text, rate: options.rate ?? NORMAL_RATE })
    if (!this.holdSynthesis) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        this.playing.delete(finish)
        resolve()
      }
      this.playing.add(finish)
      options.signal?.addEventListener('abort', () => {
        if (!this.playing.delete(finish)) return
        reject(new SpeechError('aborted'))
      })
    })
  }

  /** How many synthesize calls are still playing (only with `holdSynthesis`). */
  get speaking(): number {
    return this.playing.size
  }

  /** The audio that is playing ends: resolves the held `synthesize` calls. */
  finishSpeaking(): void {
    for (const finish of [...this.playing]) finish()
  }

  recognize(options: RecognizeOptions = {}): Promise<string> {
    this.listenCount++
    if (!this.canRecognize) return Promise.reject(new SpeechError('unsupported'))
    if (options.signal?.aborted) return Promise.reject(new SpeechError('aborted'))
    const next = this.queue.shift()
    if (next !== undefined) {
      return typeof next === 'string' ? Promise.resolve(next) : Promise.reject(new SpeechError(next.error, next.message))
    }
    return new Promise<string>((resolve, reject) => {
      this.listening = true
      this.pending = { resolve, reject }
      options.signal?.addEventListener('abort', () => {
        if (this.pending?.reject !== reject) return
        this.listening = false
        this.pending = null
        reject(new SpeechError('aborted'))
      })
    })
  }

  /** The learner says something: answers the waiting `recognize` call. */
  hear(text: string): void {
    const pending = this.pending
    this.pending = null
    this.listening = false
    pending?.resolve(text)
  }

  /** Listening fails: answers the waiting `recognize` call with an error. */
  failListening(code: SpeechErrorCode): void {
    const pending = this.pending
    this.pending = null
    this.listening = false
    pending?.reject(new SpeechError(code))
  }
}
