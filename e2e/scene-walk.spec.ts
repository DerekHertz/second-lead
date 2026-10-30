import { expect, test, type Page } from '@playwright/test'

async function startFamilyDinner(page: Page, roleName: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Family dinner' }).click()
  await page.getByRole('button', { name: roleName }).click()
}

test('the learner picks a scene, then a role', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pick a scene' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Taxi' })).toBeVisible()
  await page.getByRole('button', { name: 'Family dinner' }).click()

  await expect(page.getByRole('heading', { name: 'Pick your role' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mom' })).toBeVisible()
  await page.getByRole('button', { name: 'Kid' }).click()

  await expect(page.getByRole('heading', { name: 'Family dinner' })).toBeVisible()
  await expect(page.getByText('You play Kid.')).toBeVisible()
  await expect(page.getByText('Line 1 of 4')).toBeVisible()
})

test('the learner steps forward and back through the lines of a scene', async ({ page }) => {
  await startFamilyDinner(page, 'Kid')
  const previous = page.getByRole('button', { name: 'Previous line' })
  const next = page.getByRole('button', { name: 'Next line' })

  await expect(page.getByText('Have you eaten?')).toBeVisible()
  await expect(previous).toBeDisabled()

  await next.click()
  await expect(page.getByText('Line 2 of 4')).toBeVisible()
  await expect(page.getByText('I ate, Mom.')).toBeVisible()
  await expect(page.getByText('Have you eaten?')).toBeHidden()

  await next.click()
  await next.click()
  await expect(page.getByText('Line 4 of 4')).toBeVisible()
  await expect(next).toBeDisabled()

  await previous.click()
  await expect(page.getByText('Line 3 of 4')).toBeVisible()
  await expect(page.getByText('Do you have a girlfriend yet?')).toBeVisible()
})

test('each word of a line shows its pinyin above the characters', async ({ page }) => {
  await startFamilyDinner(page, 'Kid')
  const line = page.getByRole('article')
  const words = line.locator('ruby')

  await expect(words).toHaveCount(4)
  await expect(line.locator('ruby > rt')).toHaveText(['nǐ', 'chīfàn', 'le', 'ma'])
  await expect(words.nth(1)).toContainText('吃饭')
})

test('only the learner’s own lines are marked "Your line"', async ({ page }) => {
  await startFamilyDinner(page, 'Kid')
  const yourLine = page.getByText('Your line')

  // Line 1 is Mom's: not the learner's.
  await expect(page.getByText('Have you eaten?')).toBeVisible()
  await expect(yourLine).toHaveCount(0)

  // Line 2 is the Kid's: marked.
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(page.getByText('I ate, Mom.')).toBeVisible()
  await expect(yourLine).toBeVisible()

  // Line 3 is Mom's again.
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(yourLine).toHaveCount(0)
})
