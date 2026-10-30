import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { installFakeSpeech } from './fake-speech'

type Spoken = { text: string; rate: number; lang: string }
type SceneFile = { lines: { character: string; hanzi: string; english: string }[] }

const scene = (name: string): SceneFile =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'content', 'scenes', `${name}.json`), 'utf8'))

async function open(page: Page, title: string, role: string, recognition = true) {
  await page.addInitScript(installFakeSpeech, { recognition })
  await page.goto('/')
  await page.getByRole('button', { name: title }).click()
  await page.getByRole('button', { name: role }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
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
    await expect(status(page)).toContainText('your cue')
    await hear(page, line.hanzi)
    await expect(status(page)).toContainText('Passed')
    await page.getByRole('button', { name: 'Next line' }).click()
  }
  return mine.length
}

test('a take of the family dinner: Mom is spoken aloud, the learner answers by voice', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const file = scene('family-dinner')

  await expect(status(page)).toContainText('your cue')
  await shot(page, 't4-listening.png')
  expect((await spoken(page))[0]).toMatchObject({ text: file.lines[0]!.hanzi, lang: 'zh-CN', rate: 1 })

  await hear(page, file.lines[1]!.hanzi)
  await expect(status(page)).toContainText('Passed')
  await shot(page, 't4-verdict.png')
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(page.locator('article[aria-current="true"]')).toContainText(file.lines[3]!.english)
  await expect(status(page)).toContainText('your cue')

  // the other character's lines were all spoken, in order
  const heardSoFar = (await spoken(page)).map((s) => s.text)
  expect(heardSoFar).toEqual([file.lines[0]!.hanzi, file.lines[2]!.hanzi])
})

test('a whole take of each starter scene ends with a summary', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const dinner = scene('family-dinner')
  const n = await playThrough(page, dinner, 'kid')
  await expect(page.getByText('— 完 —')).toBeVisible()
  await page.getByRole('button', { name: 'solid' }).click()
  await expect(page.getByRole('region', { name: 'This take' })).toContainText(`${n} of ${n}`)
  expect((await spoken(page)).map((s) => s.text)).toEqual(dinner.lines.filter((l) => l.character === 'mom').map((l) => l.hanzi))

  await page.getByRole('button', { name: 'Back to shelf' }).click()
  await page.getByRole('button', { name: 'Taxi to the train station' }).click()
  await page.getByRole('button', { name: 'Passenger' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  const taxi = scene('taxi')
  const m = await playThrough(page, taxi, 'passenger')
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('region', { name: 'This take' })).toContainText(`${m} of ${m}`)
  expect((await spoken(page)).map((s) => s.text)).toEqual(
    [...dinner.lines.filter((l) => l.character === 'mom'), ...taxi.lines.filter((l) => l.character === 'driver')].map((l) => l.hanzi),
  )
})

test('hints are one tap away and counted; a miss can be flipped or retried', async ({ page }) => {
  await open(page, 'Family dinner', 'Kid')
  const file = scene('family-dinner')
  await expect(status(page)).toContainText('your cue')

  // less help puts a slip over the meaning; lifting it is a hint
  await page.getByRole('button', { name: 'Take menu' }).click()
  await page.getByRole('button', { name: 'Less help' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  const now = page.locator('article[aria-current="true"]')
  const slip = now.getByRole('button', { name: 'Show the meaning (a hint)' })
  await slip.click()
  await expect(slip).toHaveCount(0)
  await expect(now.getByText(file.lines[1]!.english)).toBeVisible()
  await expect(page.getByText('Hints used: 1')).toBeAttached()

  await page.getByRole('button', { name: 'Play slower' }).click()
  await expect(status(page)).toContainText('your cue')
  await page.getByRole('button', { name: 'Replay' }).click()
  await expect(status(page)).toContainText('your cue')
  await expect(page.getByText('Hints used: 3')).toBeAttached()
  const audio = await spoken(page)
  expect(audio.at(-2)!.rate).toBeCloseTo(0.6, 5) // the utterance stores rate as a float32
  expect(audio.at(-1)!.rate).toBe(1)
  expect(audio.at(-1)!.text).toBe(file.lines[1]!.hanzi)
  await shot(page, 't4-hints.png')

  // a miss: flip it to a pass, flip back, then say it was misheard and try again
  await hear(page, '我不知道')
  await expect(status(page)).toContainText('Not yet')
  await page.getByRole('button', { name: 'I said it right' }).click()
  await expect(status(page)).toContainText('Passed (your call)')
  await page.getByRole('button', { name: "That wasn't right" }).click()
  await expect(status(page)).toContainText('Not yet')
  await page.getByRole('button', { name: 'It misheard me' }).click()
  await expect(status(page)).toContainText('your cue')
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
