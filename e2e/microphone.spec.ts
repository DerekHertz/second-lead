import { expect, test } from '@playwright/test'

test('the microphone can be requested without a prompt', async ({ page }) => {
  await page.goto('/')
  const kinds = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const found = stream.getAudioTracks().map((t) => t.kind)
    stream.getTracks().forEach((t) => t.stop())
    return found
  })
  expect(kinds).toEqual(['audio'])
})
