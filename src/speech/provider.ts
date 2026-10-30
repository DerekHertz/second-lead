/** Why a speech call did not produce its result. */
export type SpeechErrorCode =
  | 'aborted' // the caller cancelled it (a hint interrupted, the take ended)
  | 'no-speech' // the microphone heard nothing
  | 'not-allowed' // microphone or speech service blocked
  | 'unsupported' // this browser cannot do it
  | 'failed' // anything else (network, audio capture, ...)

export class SpeechError extends Error {
  readonly code: SpeechErrorCode
  constructor(code: SpeechErrorCode, message: string = code) {
    super(message)
    this.name = 'SpeechError'
    this.code = code
  }
}

/** Speaking rate: 1 is normal speed. Slower audio is a Hint. */
export const NORMAL_RATE = 1
export const SLOW_RATE = 0.6

export type SynthesizeOptions = { rate?: number; signal?: AbortSignal }
export type RecognizeOptions = { signal?: AbortSignal }

/** A per-syllable tone assessment (a stretch provider; the browser has none). */
export type ToneAssessment = { tone_score: number }

/**
 * Everything the app needs from speech, behind one seam so a Take is testable without a
 * microphone and a better provider can replace the browser's (docs/mvp.md, "AI and speech").
 */
export interface SpeechProvider {
  /** Whether `synthesize` can speak at all. */
  readonly canSynthesize: boolean
  /** Whether `recognize` can listen at all; when false the app falls back to typed input. */
  readonly canRecognize: boolean
  /** Speak Mandarin text; resolves when the audio has finished. Rejects with a SpeechError. */
  synthesize(text: string, options?: SynthesizeOptions): Promise<void>
  /** Listen for one utterance; resolves with the text heard. Rejects with a SpeechError. */
  recognize(options?: RecognizeOptions): Promise<string>
  /** Optionally score the tones of what was heard against the expected line. */
  assess?(expected: string, heard: string): Promise<ToneAssessment>
}
