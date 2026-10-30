import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

async function startFamilyDinner(roleName: string) {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Family dinner' }))
  await user.click(screen.getByRole('button', { name: roleName }))
  return user
}

describe('walking through a scene', () => {
  it('lets the learner pick a scene, then a role, then step forward and back through its lines', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Scene picker first
    expect(screen.getByRole('heading', { name: 'Pick a scene' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Taxi' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Family dinner' }))

    // Then the role picker, listing the scene's roles
    expect(screen.getByRole('heading', { name: 'Pick your role' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mom' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Kid' }))

    // Line 1 of 4, then forward and back
    expect(screen.getByText('Line 1 of 4')).toBeTruthy()
    expect(screen.getByText('Have you eaten?')).toBeTruthy()
    const previous = screen.getByRole('button', { name: 'Previous line' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next line' }) as HTMLButtonElement
    expect(previous.disabled).toBe(true)

    await user.click(next)
    expect(screen.getByText('Line 2 of 4')).toBeTruthy()
    expect(screen.getByText('I ate, Mom.')).toBeTruthy()
    expect(screen.queryByText('Have you eaten?')).toBeNull()

    await user.click(next)
    await user.click(next)
    expect(screen.getByText('Line 4 of 4')).toBeTruthy()
    expect(next.disabled).toBe(true)

    await user.click(previous)
    expect(screen.getByText('Line 3 of 4')).toBeTruthy()
    expect(screen.getByText('Do you have a girlfriend yet?')).toBeTruthy()
  })

  it('goes back to the scene picker from a scene', async () => {
    const user = await startFamilyDinner('Kid')
    await user.click(screen.getByRole('button', { name: 'Back to scenes' }))
    expect(screen.getByRole('heading', { name: 'Pick a scene' })).toBeTruthy()
  })
})

describe('rendering a line', () => {
  it('shows each word of the characters with its pinyin above, and the English below', async () => {
    await startFamilyDinner('Kid')

    const line = screen.getByRole('article')
    const words = line.querySelectorAll('ruby')
    // 你 吃 饭 了 吗
    expect(Array.from(words, (w) => w.firstChild?.textContent)).toEqual(['你', '吃饭', '了', '吗？'])
    expect(Array.from(words, (w) => w.querySelector('rt')?.textContent)).toEqual([
      'nǐ',
      'chīfàn',
      'le',
      'ma',
    ])

    // The English comes after (below) the characters
    const english = within(line).getByText('Have you eaten?')
    const lastWord = words[words.length - 1]
    expect(lastWord.compareDocumentPosition(english) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // and names the speaking character
    expect(within(line).getByText('Mom')).toBeTruthy()
  })
})

describe('marking the learner’s lines', () => {
  it('marks only the lines spoken by the learner’s role', async () => {
    const user = await startFamilyDinner('Kid')

    // Line 1 is Mom's: not marked
    expect(screen.getByRole('article').getAttribute('data-learner')).toBe('false')
    expect(screen.queryByText('Your line')).toBeNull()

    // Line 2 is the Kid's: marked
    await user.click(screen.getByRole('button', { name: 'Next line' }))
    expect(screen.getByRole('article').getAttribute('data-learner')).toBe('true')
    expect(screen.getByText('Your line')).toBeTruthy()
  })

  it('marks the other role’s lines when the learner picks the other role', async () => {
    await startFamilyDinner('Mom')
    expect(screen.getByRole('article').getAttribute('data-learner')).toBe('true')
    expect(screen.getByText('Your line')).toBeTruthy()
  })
})
