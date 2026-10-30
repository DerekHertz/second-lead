import {
  NORMAL_RATE,
  SpeechError,
  type RecognizeOptions,
  type SpeechProvider,
  type SynthesizeOptions,
} from './provider'

// The few Web Speech members this uses, typed here because TypeScript's DOM lib does not ship them.
type Utterance = {
  lang: string
  rate: number
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

/** The parts of `window` that Web Speech lives on. */
export type SpeechWindow = {
  speechSynthesis?: { speak(utterance: Utterance): void; cancel(): void }
  SpeechSynthesisUtterance?: new (text: string) => Utterance
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

/** Mandarin (Mainland China) for both voices and recognition. */
export const SPEECH_LANG = 'zh-CN'

function recognitionError(code: string): SpeechError {
  if (code === 'no-speech') return new SpeechError('no-speech', 'nothing was heard')
  if (code === 'not-allowed' || code === 'service-not-allowed') return new SpeechError('not-allowed', code)
  if (code === 'aborted') return new SpeechError('aborted')
  return new SpeechError('failed', code)
}

/**
 * Speech from the browser's Web Speech API, in zh-CN. What the browser lacks is reported by
 * `canSynthesize` / `canRecognize` (Firefox has no recognition), and calls that need it reject
 * with an 'unsupported' SpeechError.
 */
export function createBrowserSpeech(win: SpeechWindow = window as unknown as SpeechWindow): SpeechProvider {
  const synthesis = win.speechSynthesis
  const Utterance = win.SpeechSynthesisUtterance
  const Recognizer = win.SpeechRecognition ?? win.webkitSpeechRecognition

  // Chrome can garbage-collect an utterance nothing refers to before its `onend` fires, and the
  // line would then never finish. Hold each one until it ends, fails or is cancelled.
  const speaking = new Set<Utterance>()

  return {
    canSynthesize: Boolean(synthesis && Utterance),
    canRecognize: Boolean(Recognizer),

    synthesize(text: string, { rate = NORMAL_RATE, signal }: SynthesizeOptions = {}): Promise<void> {
      if (!synthesis || !Utterance) return Promise.reject(new SpeechError('unsupported'))
      if (signal?.aborted) return Promise.reject(new SpeechError('aborted'))
      return new Promise<void>((resolve, reject) => {
        const utterance = new Utterance(text)
        utterance.lang = SPEECH_LANG
        utterance.rate = rate
        speaking.add(utterance)
        const onAbort = () => {
          speaking.delete(utterance)
          synthesis.cancel()
          reject(new SpeechError('aborted'))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        utterance.onend = () => {
          speaking.delete(utterance)
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        utterance.onerror = (event) => {
          speaking.delete(utterance)
          signal?.removeEventListener('abort', onAbort)
          const interrupted = event.error === 'canceled' || event.error === 'interrupted'
          reject(new SpeechError(interrupted ? 'aborted' : 'failed', event.error))
        }
        synthesis.speak(utterance)
      })
    },

    recognize({ signal }: RecognizeOptions = {}): Promise<string> {
      if (!Recognizer) return Promise.reject(new SpeechError('unsupported'))
      if (signal?.aborted) return Promise.reject(new SpeechError('aborted'))
      return new Promise<string>((resolve, reject) => {
        const recognition = new Recognizer()
        recognition.lang = SPEECH_LANG
        recognition.interimResults = false
        recognition.continuous = false
        recognition.maxAlternatives = 1
        let heard: string | null = null
        const onAbort = () => {
          reject(new SpeechError('aborted'))
          recognition.abort()
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        const finish = () => signal?.removeEventListener('abort', onAbort)
        recognition.onresult = (event) => {
          heard = Array.from(event.results, (r) => r[0]?.transcript ?? '').join('')
        }
        recognition.onerror = (event) => {
          finish()
          reject(recognitionError(event.error))
        }
        recognition.onend = () => {
          finish()
          if (heard !== null && heard.trim() !== '') resolve(heard)
          else reject(new SpeechError('no-speech', 'nothing was heard'))
        }
        recognition.start()
      })
    },
  }
}
