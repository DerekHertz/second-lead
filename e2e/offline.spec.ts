import { expect, test } from '@playwright/test'

test('the app loads offline after a first visit', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pick a scene' })).toBeVisible()

  // The first visit installs the service worker; wait until it controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
      )
    }
  })
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Pick a scene' })).toBeVisible()
  await page.getByRole('button', { name: 'Taxi' }).click()
  await page.getByRole('button', { name: 'Passenger' }).click()
  await expect(page.getByText('Driver, to the airport please.')).toBeVisible()
})
