import { describe, expect, it } from 'vitest'
import { createBrowserSpeech, type SpeechWindow } from './browser'
import { SpeechError } from './provider'

class FakeUtterance {
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(readonly text: string) {}
}

function fakeSynthesis() {
  const spoken: FakeUtterance[] = []
  let cancelled = 0
  return {
    spoken,
    get cancelled() {
      return cancelled
    },
    speak: (u: FakeUtterance) => void spoken.push(u),
    cancel: () => void cancelled++,
  }
}

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  interimResults = true
  continuous = true
  maxAlternatives = 0
  started = false
  aborted = false
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  abort() {
    this.aborted = true
    this.onend?.()
  }
}

function windowWith(parts: Partial<SpeechWindow>): SpeechWindow {
  return parts as SpeechWindow
}

describe('capability detection', () => {
  it('can neither speak nor listen in a browser without Web Speech', () => {
    const speech = createBrowserSpeech(windowWith({}))
    expect(speech.canSynthesize).toBe(false)
    expect(speech.canRecognize).toBe(false)
  })

  it('finds recognition under the webkit prefix (Chrome) and synthesis', () => {
    const speech = createBrowserSpeech(
      windowWith({
        speechSynthesis: fakeSynthesis(),
        SpeechSynthesisUtterance: FakeUtterance,
        webkitSpeechRecognition: FakeRecognition,
      }),
    )
    expect(speech.canSynthesize).toBe(true)
    expect(speech.canRecognize).toBe(true)
  })

  it('has no recognition when only synthesis exists (Firefox)', () => {
    const speech = createBrowserSpeech(
      windowWith({ speechSynthesis: fakeSynthesis(), SpeechSynthesisUtterance: FakeUtterance }),
    )
    expect(speech.canSynthesize).toBe(true)
    expect(speech.canRecognize).toBe(false)
    return expect(speech.recognize()).rejects.toMatchObject({ code: 'unsupported' })
  })
})

describe('synthesize', () => {
  it('speaks zh-CN at the asked rate and resolves when the audio ends', async () => {
    const synth = fakeSynthesis()
    const speech = createBrowserSpeech(windowWith({ speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance }))
    let done = false
    const promise = speech.synthesize('你好', { rate: 0.6 }).then(() => (done = true))
    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0]).toMatchObject({ text: '你好', lang: 'zh-CN', rate: 0.6 })
    await Promise.resolve()
    expect(done).toBe(false)
    synth.spoken[0]!.onend!()
    await promise
    expect(done).toBe(true)
  })

  it('rejects when the audio fails, and cancels when aborted', async () => {
    const synth = fakeSynthesis()
    const speech = createBrowserSpeech(windowWith({ speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance }))
    const failing = speech.synthesize('你好')
    synth.spoken[0]!.onerror!({ error: 'synthesis-failed' })
    await expect(failing).rejects.toMatchObject({ code: 'failed' })

    const controller = new AbortController()
    const aborted = speech.synthesize('你好', { signal: controller.signal })
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ code: 'aborted' })
    expect(synth.cancelled).toBeGreaterThan(0)
  })
})

describe('recognize', () => {
  const make = () =>
    createBrowserSpeech(windowWith({ webkitSpeechRecognition: FakeRecognition }))

  it('listens once in zh-CN and resolves with the transcript', async () => {
    const promise = make().recognize()
    const rec = FakeRecognition.last!
    expect(rec).toMatchObject({ lang: 'zh-CN', started: true, interimResults: false, continuous: false })
    rec.onresult!({ results: [[{ transcript: '你好' }]] })
    rec.onend!()
    await expect(promise).resolves.toBe('你好')
  })

  it('maps errors: no speech, a blocked microphone, anything else', async () => {
    for (const [error, code] of [
      ['no-speech', 'no-speech'],
      ['not-allowed', 'not-allowed'],
      ['service-not-allowed', 'not-allowed'],
      ['network', 'failed'],
    ] as const) {
      const promise = make().recognize()
      FakeRecognition.last!.onerror!({ error })
      FakeRecognition.last!.onend!()
      await expect(promise).rejects.toMatchObject({ code })
    }
  })

  it('ends with no-speech when nothing was heard', async () => {
    const promise = make().recognize()
    FakeRecognition.last!.onend!()
    await expect(promise).rejects.toBeInstanceOf(SpeechError)
    await expect(promise).rejects.toMatchObject({ code: 'no-speech' })
  })

  it('stops listening when aborted', async () => {
    const controller = new AbortController()
    const promise = make().recognize({ signal: controller.signal })
    controller.abort()
    expect(FakeRecognition.last!.aborted).toBe(true)
    await expect(promise).rejects.toMatchObject({ code: 'aborted' })
  })
})
