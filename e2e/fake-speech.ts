// Headless Chromium cannot run real speech recognition or voices, so these tests replace the
// browser's Web Speech API (the platform, not the app) before the app loads. The app's own
// browser provider runs unchanged on top of it. `__hear(text)` plays the learner speaking;
// `__spoken` records everything the app asked the browser to say.
export function installFakeSpeech({ recognition }: { recognition: boolean }) {
  const w = window as unknown as Record<string, any>
  w.__spoken = []
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speak(u: { text: string; rate: number; lang: string; onend?: () => void }) {
        w.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang })
        setTimeout(() => u.onend?.(), 5)
      },
      cancel() {},
    },
  })
  class FakeRecognition {
    lang = ''
    onresult: ((e: unknown) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onend: (() => void) | null = null
    start() {
      w.__recognizer = this
    }
    abort() {
      if (w.__recognizer === this) w.__recognizer = null
      this.onend?.()
    }
  }
  w.webkitSpeechRecognition = recognition ? FakeRecognition : undefined
  w.SpeechRecognition = undefined
  w.__hear = (text: string) => {
    const r = w.__recognizer
    w.__recognizer = null
    r.onresult({ results: [[{ transcript: text }]] })
    r.onend()
  }
}
