import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import type { Scene } from './scene'
import { starterScenes } from './scenes'
import { FakeSpeechProvider } from './speech/fake'

const dinner = starterScenes.find((s) => s.id === 'family-dinner')!
const learnerHanzi = (scene: Scene, roleId: string) =>
  scene.lines.filter((l) => l.roleId === roleId).map((l) => l.hanzi)

async function start(title: string, roleName: string, provider = new FakeSpeechProvider()) {
  const user = userEvent.setup()
  render(<App speech={provider} />)
  await user.click(screen.getByRole('button', { name: title }))
  await user.click(screen.getByRole('button', { name: roleName }))
  return { user, provider }
}

const status = () => screen.getByRole('status').textContent ?? ''

describe('picking a scene and a role', () => {
  it('lists the starter scenes by their real titles, then the scene’s roles', async () => {
    const user = userEvent.setup()
    render(<App speech={new FakeSpeechProvider()} />)
    expect(screen.getByRole('heading', { name: 'Pick a scene' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Taxi to the train station' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Family dinner' }))
    expect(screen.getByRole('heading', { name: 'Pick your role' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mom' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kid' })).toBeTruthy()
  })

  it('goes back to the scene picker from a take', async () => {
    const { user } = await start('Family dinner', 'Kid')
    await user.click(screen.getByRole('button', { name: 'Back to scenes' }))
    expect(screen.getByRole('heading', { name: 'Pick a scene' })).toBeTruthy()
  })
})

describe('a scene with no lines', () => {
  it('says so, with a way back, instead of crashing', async () => {
    const empty: Scene = { id: 'e', title: 'Empty scene', roles: [{ id: 'a', name: 'Anna' }], lines: [] }
    const user = userEvent.setup()
    render(<App scenes={[empty]} speech={new FakeSpeechProvider()} />)
    await user.click(screen.getByRole('button', { name: 'Empty scene' }))
    await user.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByRole('alert').textContent).toMatch(/no lines/i)
    await user.click(screen.getByRole('button', { name: 'Back to scenes' }))
    expect(screen.getByRole('heading', { name: 'Pick a scene' })).toBeTruthy()
  })
})

describe('playing a take', () => {
  it('speaks the other character, then listens on the learner’s line', async () => {
    const { provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(provider.spoken[0]!.text).toBe(dinner.lines[0]!.hanzi)
    expect(screen.getByText('Your line')).toBeTruthy()
    expect(screen.getByText('Line 2 of 10')).toBeTruthy()
  })

  it('shows characters with pinyin above each word, and keeps the English hidden until asked', async () => {
    await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const line = screen.getByRole('article')
    expect(Array.from(line.querySelectorAll('ruby'), (r) => r.firstChild?.textContent).join('')).toBe(
      dinner.lines[1]!.hanzi,
    )
    expect(line.querySelector('rt')?.textContent).toBe('mā')
    expect(within(line).queryByText(dinner.lines[1]!.english)).toBeNull()
  })

  it('judges the spoken line and shows the verdict', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(status()).toContain(dinner.lines[1]!.hanzi)
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(screen.getByText('Line 4 of 10')).toBeTruthy())
  })

  it('offers "it misheard me" (nothing logged) and flipping the verdict', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    await user.click(screen.getByRole('button', { name: 'Flip verdict' }))
    expect(status()).toMatch(/Passed/)
    expect(status()).toMatch(/your call/i)
    await user.click(screen.getByRole('button', { name: 'Flip verdict' }))
    expect(status()).toMatch(/Not yet/)
    await user.click(screen.getByRole('button', { name: 'It misheard me' }))
    await waitFor(() => expect(provider.listenCount).toBe(2))
    await waitFor(() => expect(status()).toMatch(/listening/i))
  })

  it('counts hints per line: meaning, slower and replay', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Show meaning' }))
    expect(screen.getByText(dinner.lines[1]!.english)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Play slower' }))
    await waitFor(() => expect(provider.spoken.at(-1)!.rate).toBeLessThan(1))
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    await waitFor(() => expect(provider.spoken.at(-1)!.rate).toBe(1))
    expect(screen.getByText('Hints on this line: meaning 1, slower 1, replay 1')).toBeTruthy()
  })

  it('ends with the lines passed and the hints used', async () => {
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    const { user } = await start('Family dinner', 'Kid', provider)
    for (let i = 0; i < 5; i++) {
      await user.click(await screen.findByRole('button', { name: 'Next line' }))
    }
    expect(await screen.findByRole('heading', { name: 'Take complete' })).toBeTruthy()
    expect(screen.getByText('Lines passed: 5 of 5')).toBeTruthy()
    expect(screen.getByText('Hints used: meaning 0, slower 0, replay 0')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Play again' }))
    await waitFor(() => expect(screen.getByText('Line 2 of 10')).toBeTruthy())
  })
})

describe('without speech recognition', () => {
  it('lets the learner type their line and says why', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { user } = await start('Family dinner', 'Kid', provider)
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(screen.getByText(/speech recognition isn't available/i)).toBeTruthy()
    await user.type(box, dinner.lines[1]!.hanzi)
    await user.click(screen.getByRole('button', { name: 'Check my line' }))
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(provider.listenCount).toBe(0)
  })
})

describe('leaving a take', () => {
  it('stops the microphone when the learner goes back while listening', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Back to scenes' }))
    expect(provider.listening).toBe(false)
  })

  it('stops the audio, and speaks nothing more, when the learner goes back mid-speech', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', provider)
    await waitFor(() => expect(provider.speaking).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Back to scenes' }))
    expect(provider.speaking).toBe(0)
    provider.finishSpeaking()
    await new Promise((r) => setTimeout(r, 0))
    expect(provider.spoken).toHaveLength(1)
    expect(provider.listenCount).toBe(0)
  })
})

describe('a steady layout', () => {
  it('keeps room for the meaning before it is shown, so the controls do not move', async () => {
    const { user, provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    const slot = screen.getByTestId('meaning')
    expect(slot.textContent).toBe('')
    await user.click(screen.getByRole('button', { name: 'Show meaning' }))
    expect(screen.getByTestId('meaning')).toBe(slot) // same element, now filled
    expect(slot.textContent).toBe(dinner.lines[1]!.english)
  })

  it('keeps the listening controls in place, disabled, while a hint plays', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', provider)
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    await waitFor(() => expect(status()).toMatch(/Playing/))
    const typeInstead = screen.getByRole('button', { name: 'Type instead' }) as HTMLButtonElement
    expect(typeInstead.disabled).toBe(true)
    provider.finishSpeaking()
    await waitFor(() => expect(status()).toMatch(/Listening/))
    expect((screen.getByRole('button', { name: 'Type instead' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the verdict on screen while a hint plays over it', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', provider)
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    await user.click(screen.getByRole('button', { name: 'Play slower' }))
    await waitFor(() => expect(provider.speaking).toBe(1))
    expect(status()).toMatch(/Not yet/)
    expect(status()).toContain('我不知道')
    expect((screen.getByRole('button', { name: 'Next line' }) as HTMLButtonElement).disabled).toBe(true)
    provider.finishSpeaking()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next line' }) as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('language and plain words', () => {
  it('marks the hanzi in the verdict and in the lines so far as Chinese', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(screen.getByRole('status').querySelector('[lang="zh-Hans"]')?.textContent).toBe(dinner.lines[1]!.hanzi)
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    const list = await screen.findByRole('list', { name: 'Lines so far' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]!.querySelector('[lang="zh-Hans"]')?.textContent).toBe(dinner.lines[0]!.hanzi)
    expect(list.getAttribute('lang')).toBeNull() // the role names are English
  })

  it('does not show the learner a raw error code', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'failed', message: 'audio-capture' }] })
    await start('Family dinner', 'Kid', provider)
    await waitFor(() => expect(status()).toMatch(/microphone/i))
    expect(document.body.textContent).not.toContain('audio-capture')
  })
})

describe('where focus goes', () => {
  it('opens the typed input focused when the learner types instead', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Type instead' }))
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(document.activeElement).toBe(box)
  })

  it('focuses the typed input when the take starts without recognition, and again on try again', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { user } = await start('Family dinner', 'Kid', provider)
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(document.activeElement).toBe(box)
    await user.type(box, '我不知道')
    await user.click(screen.getByRole('button', { name: 'Check my line' }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(document.activeElement).toBe(await screen.findByRole('textbox', { name: 'Type your line' }))
  })

  it('moves focus to the primary action when the verdict arrives', async () => {
    const { provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    const next = await screen.findByRole('button', { name: 'Next line' })
    expect(document.activeElement).toBe(next)
  })

  it('does not lose focus to the page when the learner moves on', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('status'))
  })

  it('focuses Listen again when nothing was heard', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'no-speech' }] })
    await start('Family dinner', 'Kid', provider)
    const again = await screen.findByRole('button', { name: 'Listen again' })
    expect(document.activeElement).toBe(again)
  })

  it('leaves focus on the hint button the learner pressed', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', provider)
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    const replay = screen.getByRole('button', { name: 'Replay' })
    await user.click(replay)
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(status()).toMatch(/Listening/))
    expect(document.activeElement).toBe(replay)
  })
})
