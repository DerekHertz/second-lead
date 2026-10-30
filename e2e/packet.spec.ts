import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { installFakeSpeech } from './fake-speech'

type SceneFile = { lines: { character: string; hanzi: string }[] }
const dinner: SceneFile = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'content', 'scenes', 'family-dinner.json'), 'utf8'),
)
const hear = (page: Page, text: string) => page.evaluate((t) => (window as any).__hear(t), text)
const status = (page: Page) => page.getByRole('status')

// Screenshots for the user's visual verdict, written only when SCREENSHOT_DIR is set.
async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR
  if (!dir) return
  await page.waitForTimeout(1000) // let flips, scrolls and pencil marks settle
  await page.screenshot({ path: join(dir, name) })
}

/** The page scrolls sideways when its content is wider than the window. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

/** Walk shelf → title page → a script page with a verdict → end page, checking each one. */
async function walk(page: Page, label: string) {
  await page.addInitScript(installFakeSpeech, { recognition: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Second Lead' })).toBeVisible()
  expect(await scrollsSideways(page), 'shelf').toBe(false)
  await shot(page, `${label}-shelf.png`)

  await page.getByRole('button', { name: 'Family dinner' }).click()
  await page.getByRole('button', { name: 'Kid' }).click()
  expect(await scrollsSideways(page), 'title page').toBe(false)
  await shot(page, `${label}-title.png`)

  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(status(page)).toContainText('your cue')
  await hear(page, '妈很多了')
  await expect(status(page)).toContainText('Not yet')
  expect(await scrollsSideways(page), 'script page').toBe(false)
  await shot(page, `${label}-miss.png`)
  await page.getByRole('button', { name: 'Next line' }).click()

  for (const line of dinner.lines.filter((l) => l.character === 'kid').slice(1)) {
    await expect(status(page)).toContainText('your cue')
    await hear(page, line.hanzi)
    await expect(status(page)).toContainText('Passed')
    if (line === dinner.lines[3]) await shot(page, `${label}-pass.png`)
    await page.getByRole('button', { name: 'Next line' }).click()
  }
  await expect(page.getByRole('region', { name: 'End page' })).toBeVisible()
  await page.getByRole('button', { name: 'solid' }).click()
  await expect(page.getByRole('region', { name: 'This take' })).toBeVisible()
  expect(await scrollsSideways(page), 'end page').toBe(false)
  await shot(page, `${label}-end.png`)
}

test('every screen fits a 400px phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 })
  await walk(page, 'phone')
})

test('every screen fits a desktop window without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await walk(page, 'desktop')
})

test('dark mode follows the system setting', async ({ page }) => {
  const desk = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Second Lead' })).toBeVisible()
  const light = await desk()
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await desk()
  expect(dark).not.toBe(light)
  const [r, g, b] = dark.match(/\d+/g)!.map(Number)
  expect(r! + g! + b!).toBeLessThan(150) // a dark desk under the lamp
  await page.getByRole('button', { name: 'Family dinner' }).click()
  await shot(page, 'dark-title.png')
})

/** The flipped title page's transform once Begin has turned it over the staple. */
async function flippedTransform(page: Page) {
  await page.addInitScript(installFakeSpeech, { recognition: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Family dinner' }).click()
  await page.getByRole('button', { name: 'Kid' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('region', { name: 'Page 1' })).toBeVisible()
  await page.waitForTimeout(1000) // the flip has finished
  return page.locator('.page').first().evaluate((el) => getComputedStyle(el).transform)
}

test('Begin flips the title page up over the staple', async ({ page }) => {
  expect(await flippedTransform(page)).toMatch(/^matrix3d/)
})

test('with reduced motion, the flip is a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await flippedTransform(page)).toBe('none')
  expect(await page.locator('.page').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
})
