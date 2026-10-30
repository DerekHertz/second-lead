import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Headless Chromium cannot run real speech recognition or voices, so these tests replace the
// browser's Web Speech API (the platform, not the app) before the app loads. The app's own
// browser provider runs unchanged on top of it. `__hear(text)` plays the learner speaking;
// `__spoken` records everything the app asked the browser to say.
function installFakeSpeech({ recognition }: { recognition: boolean }) {
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

type Spoken = { text: string; rate: number; lang: string }
type SceneFile = { lines: { character: string; hanzi: string; english: string }[] }

const scene = (name: string): SceneFile =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'content', 'scenes', `${name}.json`), 'utf8'))

async function open(page: Page, title: string, role: string, recognition = true) {
  await page.addInitScript(installFakeSpeech, { recognition })
  await page.goto('/')
  await page.getByRole('button', { name: title }).click()
  await page.getByRole('button', { name: role }).click()
}

const status = (page: Page) => page.getByRole('status')
const hear = (page: Page, text: string) => page.evaluate((t) => (window as any).__hear(t), text)
const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as Spoken[])

// Screenshots for the reviewer, written only when SCREENSHOT_DIR is set.
async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR
  if (dir) await page.screenshot({ path: join(dir, name), fullPage: true })
}

/** Play every learner line of a scene by saying it as written. */
async function playThrough(page: Page, file: SceneFile, learner: string) {
  const mine = file.lines.filter((l) => l.character === learner)
  for (const line of mine) {
    await expect(status(page)).toContainText('Listening')
    await hear(page, line.hanzi)
    await expect(status(page)).toContainText('Passed')
    await page.getByRole('button', { name: 'Next line' }).click()
  }
  return mine.length
}

test('a take of the family dinner: Mom is spoken aloud, the learner answers by voice', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const file = scene('family-dinner')

  await expect(status(page)).toContainText('Listening')
  await shot(page, 't4-listening.png')
  expect((await spoken(page))[0]).toMatchObject({ text: file.lines[0]!.hanzi, lang: 'zh-CN', rate: 1 })

  await hear(page, file.lines[1]!.hanzi)
  await expect(status(page)).toContainText('Passed')
  await shot(page, 't4-verdict.png')
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(page.getByText('Line 4 of 10')).toBeVisible()
  await expect(status(page)).toContainText('Listening')

  // the other character's lines were all spoken, in order
  const heardSoFar = (await spoken(page)).map((s) => s.text)
  expect(heardSoFar).toEqual([file.lines[0]!.hanzi, file.lines[2]!.hanzi])
})

test('a whole take of each starter scene ends with a summary', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const dinner = scene('family-dinner')
  const n = await playThrough(page, dinner, 'kid')
  await expect(page.getByRole('heading', { name: 'Take complete' })).toBeVisible()
  await expect(page.getByText(`Lines passed: ${n} of ${n}`)).toBeVisible()
  expect((await spoken(page)).map((s) => s.text)).toEqual(dinner.lines.filter((l) => l.character === 'mom').map((l) => l.hanzi))

  await page.getByRole('button', { name: 'Back to scenes' }).click()
  await page.getByRole('button', { name: 'Taxi to the train station' }).click()
  await page.getByRole('button', { name: 'Passenger' }).click()
  const taxi = scene('taxi')
  const m = await playThrough(page, taxi, 'passenger')
  await expect(page.getByText(`Lines passed: ${m} of ${m}`)).toBeVisible()
  expect((await spoken(page)).map((s) => s.text)).toEqual(
    [...dinner.lines.filter((l) => l.character === 'mom'), ...taxi.lines.filter((l) => l.character === 'driver')].map((l) => l.hanzi),
  )
})

test('hints are one tap away and counted per line; a miss can be flipped or retried', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const file = scene('family-dinner')
  await expect(status(page)).toContainText('Listening')

  await expect(page.getByText(file.lines[1]!.english)).toHaveCount(0)
  await page.getByRole('button', { name: 'Show meaning' }).click()
  await expect(page.getByText(file.lines[1]!.english)).toBeVisible()
  await page.getByRole('button', { name: 'Play slower' }).click()
  await expect(status(page)).toContainText('Listening')
  await page.getByRole('button', { name: 'Replay' }).click()
  await expect(status(page)).toContainText('Listening')
  await expect(page.getByText('Hints on this line: meaning 1, slower 1, replay 1')).toBeVisible()
  const audio = await spoken(page)
  expect(audio.at(-2)!.rate).toBeCloseTo(0.6, 5) // the utterance stores rate as a float32
  expect(audio.at(-1)!.rate).toBe(1)
  expect(audio.at(-1)!.text).toBe(file.lines[1]!.hanzi)
  await shot(page, 't4-hints.png')

  // a miss: flip it to a pass, flip back, then say it was misheard and try again
  await hear(page, '我不知道')
  await expect(status(page)).toContainText('Not yet')
  await page.getByRole('button', { name: 'Flip verdict' }).click()
  await expect(status(page)).toContainText('Passed (your call)')
  await page.getByRole('button', { name: 'Flip verdict' }).click()
  await expect(status(page)).toContainText('Not yet')
  await page.getByRole('button', { name: 'It misheard me' }).click()
  await expect(status(page)).toContainText('Listening')
  await hear(page, file.lines[1]!.hanzi)
  await expect(status(page)).toContainText('Passed')
})

test('without speech recognition the learner types, and the app says why', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid', false)
  const file = scene('family-dinner')

  await expect(page.getByText("Speech recognition isn't available in this browser, so type what you say.")).toBeVisible()
  await page.getByRole('textbox', { name: 'Type your line' }).fill(file.lines[1]!.hanzi)
  await page.getByRole('button', { name: 'Check my line' }).click()
  await expect(status(page)).toContainText('Passed')
})
