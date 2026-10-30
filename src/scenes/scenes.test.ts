import { describe, expect, it } from 'vitest'
import { sceneFromFile } from './adapter'
import { starterScenes } from './index'

describe('the starter scenes', () => {
  it('are the two scenes in content/scenes, with their real titles and two roles each', () => {
    expect(starterScenes.map((s) => s.title)).toEqual(['Family dinner', 'Taxi to the train station'])
    for (const scene of starterScenes) {
      expect(scene.roles).toHaveLength(2)
      expect(scene.lines.length).toBeGreaterThanOrEqual(8)
    }
  })

  it('keep each line’s characters, authored pinyin and English, and the role that says it', () => {
    const taxi = starterScenes.find((s) => s.id === 'taxi')!
    expect(taxi.roles.map((r) => r.id).sort()).toEqual(['driver', 'passenger'])
    expect(taxi.lines[0]).toMatchObject({
      roleId: 'driver',
      hanzi: '您好，去哪儿？',
      pinyin: 'nín hǎo, qù nǎr?',
      english: 'Hello, where to?',
    })
  })

  it('split every line into words that rejoin to its characters, each with pinyin above', () => {
    for (const scene of starterScenes) {
      for (const line of scene.lines) {
        expect(line.words.map((w) => w.hanzi).join('')).toBe(line.hanzi)
        for (const word of line.words) expect(word.pinyin).not.toBe('')
        expect(line.words.map((w) => w.pinyin).join(' ')).toBe(line.pinyin.replace(/[,.?!]/g, ''))
      }
    }
  })

  it('put punctuation with the word before it and an erhua 儿 with its word', () => {
    const taxi = starterScenes.find((s) => s.id === 'taxi')!
    expect(taxi.lines[0]!.words).toEqual([
      { hanzi: '您', pinyin: 'nín' },
      { hanzi: '好，', pinyin: 'hǎo' },
      { hanzi: '去', pinyin: 'qù' },
      { hanzi: '哪儿？', pinyin: 'nǎr' },
    ])
  })
})

describe('sceneFromFile', () => {
  const file = {
    id: 's',
    title: 'T',
    characters: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    lines: [{ id: 's-1', character: 'a', position: 1, hanzi: '你好', pinyin: 'nǐ hǎo', english: 'Hello' }],
  }

  it('maps characters to roles and lines to words', () => {
    expect(sceneFromFile(file)).toEqual({
      id: 's',
      title: 'T',
      roles: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      lines: [
        {
          roleId: 'a',
          hanzi: '你好',
          pinyin: 'nǐ hǎo',
          english: 'Hello',
          words: [
            { hanzi: '你', pinyin: 'nǐ' },
            { hanzi: '好', pinyin: 'hǎo' },
          ],
        },
      ],
    })
  })

  it('shows a line as one word when its pinyin does not line up with its characters', () => {
    const odd = { ...file, lines: [{ ...file.lines[0]!, pinyin: 'nǐ hǎo ma' }] }
    expect(sceneFromFile(odd).lines[0]!.words).toEqual([{ hanzi: '你好', pinyin: 'nǐ hǎo ma' }])
  })

  it('reads an erhua r set apart from its syllable (zhè r)', () => {
    const line = { ...file.lines[0]!, hanzi: '这儿', pinyin: 'zhè r' }
    expect(sceneFromFile({ ...file, lines: [line] }).lines[0]!.words).toEqual([{ hanzi: '这儿', pinyin: 'zhè r' }])
  })
})
