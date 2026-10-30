import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import type { Scene, SupportLevel } from './scene'
import { starterScenes } from './scenes'
import { FakeSpeechProvider } from './speech/fake'

const dinner = starterScenes.find((s) => s.id === 'family-dinner')!
const learnerHanzi = (scene: Scene, roleId: string) =>
  scene.lines.filter((l) => l.roleId === roleId).map((l) => l.hanzi)

type Options = { provider?: FakeSpeechProvider; support?: (scene: Scene, roleId: string) => SupportLevel[] }

/** Open a packet from the shelf, pick a role on its title page and Begin. */
async function start(title: string, roleName: string, { provider = new FakeSpeechProvider(), support }: Options = {}) {
  const user = userEvent.setup()
  render(<App speech={provider} support={support} />)
  await user.click(screen.getByRole('button', { name: title }))
  await user.click(screen.getByRole('button', { name: roleName }))
  await user.click(screen.getByRole('button', { name: 'Begin' }))
  return { user, provider }
}

/** Every line of the scene at one support level. */
const allAt = (level: SupportLevel) => (scene: Scene) => scene.lines.map(() => level)

const status = () => screen.getByRole('status').textContent ?? ''
const currentLine = () => document.querySelector<HTMLElement>('article[aria-current="true"]')!
const line = (i: number) => document.querySelectorAll<HTMLElement>('article.line')[i]!

/** The text a line shows: what is under a slip (aria-hidden) does not count. */
function shown(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return copy.textContent ?? ''
}

/** Play the learner's lines of the family dinner through to the end page. */
async function playDinnerThrough(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 5; i++) await user.click(await screen.findByRole('button', { name: 'Next line' }))
  await screen.findByRole('region', { name: 'End page' })
}

describe('the shelf', () => {
  it('shows each starter scene as a packet, and a blank packet to import a script', () => {
    render(<App speech={new FakeSpeechProvider()} />)
    expect(screen.getByRole('heading', { name: 'Second Lead' })).toBeTruthy()
    const dinnerCover = screen.getByRole('button', { name: 'Family dinner' })
    expect(dinnerCover.textContent).toContain('Mom · Kid')
    expect(screen.getByRole('button', { name: 'Taxi to the train station' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import a script' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Continue/ })).toBeNull()
  })

  it('offers "Continue as <role>" once there is a take, and it opens straight onto the script', async () => {
    const { user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    await user.click(screen.getByRole('button', { name: 'Continue Family dinner as Kid' }))
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(screen.getByRole('region', { name: 'Page 1' })).toBeTruthy()
  })

  it('shows how many of the learner’s lines have faded, from their support levels', async () => {
    const support = (scene: Scene) => scene.lines.map((_, i): SupportLevel => (i === 1 || i === 3 ? 2 : 0))
    const { user } = await start('Family dinner', 'Kid', { support })
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(screen.getByRole('button', { name: 'Family dinner' }).textContent).toContain('2 of 5 faded')
  })
})

describe('the title page', () => {
  it('lists the cast; tapping a name picks the role, and Begin starts the take', async () => {
    const user = userEvent.setup()
    const provider = new FakeSpeechProvider()
    render(<App speech={provider} />)
    await user.click(screen.getByRole('button', { name: 'Family dinner' }))
    const title = screen.getByRole('region', { name: 'Title page' })
    expect(within(title).getByRole('heading', { name: 'Family dinner' })).toBeTruthy()
    const begin = within(title).getByRole('button', { name: 'Begin' }) as HTMLButtonElement
    expect(begin.disabled).toBe(true)
    await user.click(within(title).getByRole('button', { name: 'Kid' }))
    expect(within(title).getByRole('button', { name: 'Kid' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(title).getByRole('button', { name: 'Mom' }).getAttribute('aria-pressed')).toBe('false')
    expect(provider.spoken).toHaveLength(0)
    await user.click(begin)
    expect(screen.getByRole('region', { name: 'Page 1' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Title page' })).toBeNull() // flipped over the staple
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(provider.spoken[0]!.text).toBe(dinner.lines[0]!.hanzi)
  })

  it('goes back to the shelf', async () => {
    const { user } = await start('Family dinner', 'Kid')
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(screen.getByRole('heading', { name: 'Second Lead' })).toBeTruthy()
  })
})

describe('a scene with no lines', () => {
  it('says so, with a way back, instead of crashing', async () => {
    const empty: Scene = { id: 'e', title: 'Empty scene', roles: [{ id: 'a', name: 'Anna' }], lines: [] }
    const user = userEvent.setup()
    render(<App scenes={[empty]} speech={new FakeSpeechProvider()} />)
    await user.click(screen.getByRole('button', { name: 'Empty scene' }))
    expect(screen.getByRole('alert').textContent).toMatch(/no lines/i)
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(screen.getByRole('heading', { name: 'Second Lead' })).toBeTruthy()
  })
})

describe('lines on the page', () => {
  it('sets the learner’s line interlinear: pinyin over each word, the characters, and the English', async () => {
    await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const now = currentLine()
    expect(now).toBe(line(1))
    expect(now.dataset.learner).toBe('true')
    expect(within(now).getByText('(you)')).toBeTruthy()
    expect(Array.from(now.querySelectorAll('ruby'), (r) => r.firstChild?.textContent).join('')).toBe(dinner.lines[1]!.hanzi)
    expect(now.querySelector('rt')?.textContent).toBe('mā')
    expect(shown(now)).toContain(dinner.lines[1]!.english) // full support by default
    expect(within(now).queryByRole('button')).toBeNull()
  })

  it('shows the other characters’ lines in full in a scripted take', async () => {
    await start('Family dinner', 'Kid', { support: allAt(3) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(shown(line(0))).toContain(dinner.lines[0]!.english)
    expect(shown(line(0))).toContain('多')
  })

  it('puts a few exchanges on each page: four lines, then the next page', async () => {
    await start('Family dinner', 'Kid')
    const page = screen.getByRole('region', { name: 'Page 1' })
    expect(page.querySelectorAll('article.line')).toHaveLength(4)
    expect(screen.getByText('p. 1 of 3')).toBeTruthy()
  })
})

describe('support levels', () => {
  it('level 0 shows characters, pinyin and English, with no slip', async () => {
    await start('Family dinner', 'Kid', { support: allAt(0) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const now = currentLine()
    expect(shown(now)).toContain(dinner.lines[1]!.english)
    expect(shown(now)).toContain('mā')
    expect(within(now).queryByRole('button', { name: /hint/ })).toBeNull()
  })

  it('level 1 covers the English with a slip', async () => {
    await start('Family dinner', 'Kid', { support: allAt(1) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const now = currentLine()
    expect(within(now).getByRole('button', { name: 'Show the meaning (a hint)' })).toBeTruthy()
    expect(shown(now)).not.toContain(dinner.lines[1]!.english)
    expect(shown(now)).toContain('mā')
    expect(shown(now)).toContain('已经')
  })

  it('level 2 covers the characters and pinyin, leaving the English', async () => {
    await start('Family dinner', 'Kid', { support: allAt(2) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const now = currentLine()
    expect(within(now).getByRole('button', { name: 'Show the words (a hint)' })).toBeTruthy()
    expect(shown(now)).toContain(dinner.lines[1]!.english)
    expect(shown(now)).not.toContain('mā')
    expect(shown(now)).not.toContain('已经')
  })

  it('level 3 covers the whole line with a slip that shows one tick per syllable', async () => {
    await start('Family dinner', 'Kid', { support: allAt(3) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const now = currentLine()
    const slip = within(now).getByRole('button', { name: 'Show the line (a hint)' })
    expect(shown(now)).not.toContain(dinner.lines[1]!.english)
    expect(shown(now)).not.toContain('已经')
    // mā, wǒ yǐjīng chī le hěn duō le: nine syllables
    expect(slip.querySelectorAll('[data-tick]')).toHaveLength(9)
  })

  it('lifting a slip shows what was under it and records a meaning hint', async () => {
    const { user } = await start('Family dinner', 'Kid', { support: allAt(1) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(screen.queryByText(/Hints used/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show the meaning (a hint)' }))
    expect(shown(currentLine())).toContain(dinner.lines[1]!.english)
    expect(screen.queryByRole('button', { name: 'Show the meaning (a hint)' })).toBeNull()
    expect(screen.getByText('Hints used: 1')).toBeTruthy()
  })

  it('after an attempt the slips lift on their own, and that is not a hint', async () => {
    const { provider } = await start('Family dinner', 'Kid', { support: allAt(3) })
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    expect(within(currentLine()).queryByRole('button', { name: /a hint/ })).toBeNull()
    expect(shown(currentLine())).toContain(dinner.lines[1]!.english)
    expect(screen.queryByText(/Hints used/)).toBeNull()
  })

  it('“More help” and “Less help” in the take menu change the support of the line you are on', async () => {
    const { user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    const menu = screen.getByRole('dialog', { name: 'Take menu' })
    await user.click(within(menu).getByRole('button', { name: 'Less help' }))
    await user.click(within(menu).getByRole('button', { name: 'Less help' }))
    expect(within(currentLine()).getByRole('button', { name: 'Show the words (a hint)' })).toBeTruthy()
    await user.click(within(menu).getByRole('button', { name: 'More help' }))
    expect(within(currentLine()).getByRole('button', { name: 'Show the meaning (a hint)' })).toBeTruthy()
  })
})

describe('listen first', () => {
  it('covers the other character’s line until its audio ends; lifting it early is a hint', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    const toggle = screen.getByRole('switch', { name: 'Listen first' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    // Mom's next line is still to come: covered
    expect(shown(line(2))).not.toContain(dinner.lines[2]!.english)
    expect(shown(line(0))).toContain(dinner.lines[0]!.english) // already heard
    provider.hear(dinner.lines[1]!.hanzi)
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(provider.speaking).toBe(1))
    await user.click(within(line(2)).getByRole('button', { name: 'Show their line (a hint)' }))
    expect(shown(line(2))).toContain(dinner.lines[2]!.english)
    expect(screen.getByText('Hints used: 1')).toBeTruthy()
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
  })

  it('uncovers the line by itself once its audio has ended', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    await user.click(screen.getByRole('switch', { name: 'Listen first' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    provider.hear(dinner.lines[1]!.hanzi)
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(provider.speaking).toBe(1))
    expect(shown(line(2))).not.toContain(dinner.lines[2]!.english)
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    expect(shown(line(2))).toContain(dinner.lines[2]!.english)
    expect(screen.queryByText(/Hints used/)).toBeNull()
  })
})

describe('the dock', () => {
  it('opens the mic on the learner’s cue, and a tap pauses it', async () => {
    const { user, provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    expect(status()).toMatch(/your cue/i)
    await user.click(screen.getByRole('button', { name: 'Pause listening' }))
    expect(provider.listening).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Start listening' }))
    await waitFor(() => expect(provider.listening).toBe(true))
  })

  it('with auto-cue off, waits for a tap on the mic', async () => {
    const { user, provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    await user.click(screen.getByRole('switch', { name: 'Auto-cue' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    provider.hear(dinner.lines[1]!.hanzi)
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(status()).toMatch(/tap the mic/i))
    expect(provider.listenCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Start listening' }))
    await waitFor(() => expect(provider.listening).toBe(true))
  })

  it('offers the verdict flip, and "It misheard me" on a miss, only after an attempt', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    expect(screen.queryByRole('button', { name: 'It misheard me' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I said it right' })).toBeNull()
    expect(screen.queryByRole('button', { name: "That wasn't right" })).toBeNull()
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    await user.click(screen.getByRole('button', { name: 'I said it right' }))
    expect(status()).toMatch(/Passed/)
    expect(status()).toMatch(/your call/i)
    await user.click(screen.getByRole('button', { name: "That wasn't right" }))
    expect(status()).toMatch(/Not yet/)
    await user.click(screen.getByRole('button', { name: 'It misheard me' }))
    await waitFor(() => expect(provider.listenCount).toBe(2))
    await waitFor(() => expect(status()).toMatch(/listening/i))
    expect(screen.queryByRole('button', { name: 'It misheard me' })).toBeNull()
  })

  it('does not offer "It misheard me" on a pass', async () => {
    const { provider } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(screen.getByRole('button', { name: "That wasn't right" })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'It misheard me' })).toBeNull()
  })

  it('the mic tries the line again after a verdict', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(provider.listening).toBe(true))
    expect(provider.listenCount).toBe(2)
  })

  it('counts replay and slower as hints', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Play slower' }))
    await waitFor(() => expect(provider.spoken.at(-1)!.rate).toBeLessThan(1))
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    await waitFor(() => expect(provider.spoken.at(-1)!.rate).toBe(1))
    expect(screen.getByText('Hints used: 2')).toBeTruthy()
  })

  it('is hidden on the title page and the end page', async () => {
    const user = userEvent.setup()
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    render(<App speech={provider} />)
    await user.click(screen.getByRole('button', { name: 'Family dinner' }))
    expect(screen.queryByRole('button', { name: 'Take menu' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Kid' }))
    await user.click(screen.getByRole('button', { name: 'Begin' }))
    expect(screen.getByRole('button', { name: 'Take menu' })).toBeTruthy()
    await playDinnerThrough(user)
    expect(screen.queryByRole('button', { name: 'Take menu' })).toBeNull()
  })
})

describe('pencil marks', () => {
  it('a pass gets a check and a tone note in the margin, and keeps them after the scene moves on', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear(dinner.lines[1]!.hanzi)
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(within(line(1)).getByRole('img', { name: 'Passed' })).toBeTruthy()
    expect(within(line(1)).getByText(/^tones \d+\/\d+$/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(currentLine()).toBe(line(3)))
    expect(within(line(1)).getByRole('img', { name: 'Passed' })).toBeTruthy()
  })

  it('a miss underlines the missed words and says what was heard, in Chinese', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('妈很多了')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    const now = currentLine()
    const missed = Array.from(now.querySelectorAll('ruby[data-missed="true"]'), (r) => r.firstChild?.textContent)
    expect(missed).toEqual(['我', '已经', '吃', '了'])
    const heard = within(now).getByText(/heard:/)
    expect(heard.querySelector('[lang="zh-Hans"]')?.textContent).toBe('妈很多了')
    // the miss stays marked when the learner moves on
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(currentLine()).toBe(line(3)))
    expect(within(line(1)).getByText(/heard:/)).toBeTruthy()
  })
})

describe('turning pages', () => {
  it('flips the page when its last line is done, and the next page comes up', async () => {
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await user.click(await screen.findByRole('button', { name: 'Next line' })) // line 2
    await screen.findByRole('button', { name: 'Next line' }) // line 4, the last on page 1
    expect(screen.getByRole('region', { name: 'Page 1' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Page 2' })).toBeTruthy())
    expect(screen.queryByRole('region', { name: 'Page 1' })).toBeNull()
    expect(screen.getByText('p. 2 of 3')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Page 2' }).contains(currentLine())).toBe(true)
  })

  it('flips back to review an earlier page, and the dock offers "Back to your page"', async () => {
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    await user.click(await screen.findByRole('button', { name: 'Next line' }))
    await screen.findByRole('region', { name: 'Page 2' })
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('region', { name: 'Page 1' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to your page' }))
    expect(screen.getByRole('region', { name: 'Page 2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to your page' })).toBeNull()
  })
})

describe('the end page', () => {
  async function toTheEnd(support?: Options['support']) {
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    const ctx = await start('Family dinner', 'Kid', { provider, support })
    await playDinnerThrough(ctx.user)
    return ctx
  }

  it('asks for the check-in first, and keeps the summary hidden until the learner checks in', async () => {
    const { user } = await toTheEnd()
    const end = screen.getByRole('region', { name: 'End page' })
    expect(within(end).getByText('— 完 —')).toBeTruthy()
    expect(within(end).getByRole('heading', { name: 'How did that take feel?' })).toBeTruthy()
    for (const name of ['rough', 'shaky', 'solid', 'owned it']) expect(within(end).getByRole('button', { name })).toBeTruthy()
    expect(within(end).getByRole('textbox', { name: 'Check-in note' })).toBeTruthy()
    expect(within(end).queryByRole('heading', { name: 'This take' })).toBeNull()
    expect(within(end).queryByRole('button', { name: 'Again' })).toBeNull()
    await user.click(within(end).getByRole('button', { name: 'solid' }))
    expect(within(end).getByRole('button', { name: 'solid' }).getAttribute('aria-pressed')).toBe('true')
    const summary = within(end).getByRole('region', { name: 'This take' })
    const stat = (term: string) => within(summary).getByText(term).closest('div')!.querySelector('dd')!.textContent
    expect(stat('Lines passed')).toBe('5 of 5')
    expect(stat('Hints used')).toBe('0')
    expect(stat('Lines missed')).toBe('0')
  })

  it('shows the summary when the learner skips the check-in', async () => {
    const { user } = await toTheEnd()
    expect(screen.queryByRole('region', { name: 'This take' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('region', { name: 'This take' })).toBeTruthy()
  })

  it('counts lifted slips in the summary', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider, support: allAt(1) })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Show the meaning (a hint)' }))
    for (const i of [1, 3, 5, 7, 9]) {
      await waitFor(() => expect(provider.listening).toBe(true))
      provider.hear(dinner.lines[i]!.hanzi)
      await user.click(await screen.findByRole('button', { name: 'Next line' }))
      if (i < 9) {
        await waitFor(() => expect(provider.speaking).toBe(1))
        provider.finishSpeaking()
      }
    }
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    const summary = screen.getByRole('region', { name: 'This take' })
    expect(within(summary).getByText('Hints used').closest('div')!.querySelector('dd')!.textContent).toBe('1')
  })

  it('“Again” plays the scene again from page 1', async () => {
    const { user, provider } = await toTheEnd()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Again' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Page 1' })).toBeTruthy())
    await waitFor(() => expect(provider.spoken).toHaveLength(6))
  })

  it('“Swap roles” goes back to the title page with the other role picked', async () => {
    const { user } = await toTheEnd()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Swap roles' }))
    const title = screen.getByRole('region', { name: 'Title page' })
    expect(within(title).getByRole('button', { name: 'Mom' }).getAttribute('aria-pressed')).toBe('true')
    expect((within(title).getByRole('button', { name: 'Begin' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('goes back to the shelf', async () => {
    const { user } = await toTheEnd()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Back to shelf' }))
    expect(screen.getByRole('heading', { name: 'Second Lead' })).toBeTruthy()
  })
})

describe('keyboard', () => {
  it('reaches a slip by Tab and lifts it with Enter', async () => {
    const { user } = await start('Family dinner', 'Kid', { support: allAt(1) })
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const slip = screen.getByRole('button', { name: 'Show the meaning (a hint)' })
    for (let i = 0; i < 30 && document.activeElement !== slip; i++) await user.tab()
    expect(document.activeElement).toBe(slip)
    await user.keyboard('{Enter}')
    expect(screen.getByText('Hints used: 1')).toBeTruthy()
  })

  it('reaches the dock controls by Tab', async () => {
    const { user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(status()).toMatch(/listening/i))
    const reached = new Set<string>()
    for (let i = 0; i < 30; i++) {
      await user.tab()
      reached.add(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')
    }
    for (const name of ['Replay', 'Play slower', 'Pause listening', 'Take menu']) expect(reached).toContain(name)
  })
})

describe('without speech recognition', () => {
  it('lets the learner type their line and says why', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { user } = await start('Family dinner', 'Kid', { provider })
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(screen.getByText(/speech recognition isn't available/i)).toBeTruthy()
    await user.type(box, dinner.lines[1]!.hanzi)
    await user.click(screen.getByRole('button', { name: 'Check my line' }))
    await waitFor(() => expect(status()).toMatch(/Passed/))
    expect(provider.listenCount).toBe(0)
  })

  it('can switch to typing from the take menu while listening', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    await user.click(screen.getByRole('button', { name: 'Type instead' }))
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(document.activeElement).toBe(box)
    expect(provider.listening).toBe(false)
  })
})

describe('leaving a take', () => {
  it('stops the microphone when the learner goes back while listening', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(provider.listening).toBe(false)
  })

  it('leaves from the take menu', async () => {
    const { provider, user } = await start('Family dinner', 'Kid')
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Take menu' }))
    await user.click(screen.getByRole('button', { name: 'Leave the take' }))
    expect(screen.getByRole('heading', { name: 'Second Lead' })).toBeTruthy()
    expect(provider.listening).toBe(false)
  })

  it('stops the audio, and speaks nothing more, when the learner goes back mid-speech', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(provider.speaking).toBe(0)
    provider.finishSpeaking()
    await new Promise((r) => setTimeout(r, 0))
    expect(provider.spoken).toHaveLength(1)
    expect(provider.listenCount).toBe(0)
  })
})

describe('a steady dock', () => {
  it('keeps the mic in place, disabled, while a hint plays', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    await waitFor(() => expect(status()).toMatch(/Playing/))
    expect((screen.getByRole('button', { name: 'Pause listening' }) as HTMLButtonElement).disabled).toBe(true)
    provider.finishSpeaking()
    await waitFor(() => expect(status()).toMatch(/your cue/i))
    expect((screen.getByRole('button', { name: 'Pause listening' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the verdict while a hint plays over it', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    provider.hear('我不知道')
    await waitFor(() => expect(status()).toMatch(/Not yet/))
    await user.click(screen.getByRole('button', { name: 'Play slower' }))
    await waitFor(() => expect(provider.speaking).toBe(1))
    expect(within(currentLine()).getByText(/heard:/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next line' }) as HTMLButtonElement).disabled).toBe(true)
    provider.finishSpeaking()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next line' }) as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('plain words', () => {
  it('does not show the learner a raw error code', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'failed', message: 'audio-capture' }] })
    await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(document.body.textContent).toMatch(/microphone/i))
    expect(document.body.textContent).not.toContain('audio-capture')
  })
})

describe('where focus goes', () => {
  it('focuses the typed input when the take starts without recognition, and again on try again', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { user } = await start('Family dinner', 'Kid', { provider })
    const box = await screen.findByRole('textbox', { name: 'Type your line' })
    expect(document.activeElement).toBe(box)
    await user.type(box, '我不知道')
    await user.click(screen.getByRole('button', { name: 'Check my line' }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(document.activeElement).toBe(await screen.findByRole('textbox', { name: 'Type your line' }))
  })

  it('moves focus to "Next line" when the verdict arrives', async () => {
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
    expect(document.activeElement).toBe(screen.getByRole('status'))
  })

  it('focuses the mic to listen again when nothing was heard', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'no-speech' }] })
    await start('Family dinner', 'Kid', { provider })
    const again = await screen.findByRole('button', { name: 'Listen again' })
    expect(document.activeElement).toBe(again)
  })

  it('leaves focus on the hint button the learner pressed', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(provider.listening).toBe(true))
    const replay = screen.getByRole('button', { name: 'Replay' })
    await user.click(replay)
    await waitFor(() => expect(provider.speaking).toBe(1))
    provider.finishSpeaking()
    await waitFor(() => expect(status()).toMatch(/your cue/i))
    expect(document.activeElement).toBe(replay)
  })

  it('moves focus to the check-in when the take ends', async () => {
    const provider = new FakeSpeechProvider({ heard: learnerHanzi(dinner, 'kid') })
    const { user } = await start('Family dinner', 'Kid', { provider })
    await playDinnerThrough(user)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'How did that take feel?' })))
  })
})
