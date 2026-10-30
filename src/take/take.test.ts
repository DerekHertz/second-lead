import { describe, expect, it, vi } from 'vitest'
import type { Scene } from '../scene'
import { starterScenes } from '../scenes'
import { FakeSpeechProvider } from '../speech/fake'
import { SLOW_RATE } from '../speech/provider'
import { createTake, type Take, type TakePhase } from './take'

const dinner = starterScenes.find((s) => s.id === 'family-dinner')!
const taxi = starterScenes.find((s) => s.id === 'taxi')!

async function until(take: Take, phase: TakePhase) {
  await vi.waitFor(() => expect(take.getState().phase).toBe(phase))
}

/** A fresh take of `scene` as `roleId`, started; the provider hears `heard` in order. */
function begin(scene: Scene, roleId: string, provider = new FakeSpeechProvider()) {
  const take = createTake({ scene, roleId, provider })
  take.start()
  return { take, provider }
}

const hanziOf = (scene: Scene, roleId: string, learners: boolean) =>
  scene.lines.filter((l) => (l.roleId === roleId) === learners).map((l) => l.hanzi)

describe('a take of each starter scene', () => {
  for (const scene of starterScenes) {
    for (const role of scene.roles) {
      it(`plays ${scene.title} as ${role.name} end to end, speaking the other character's lines aloud`, async () => {
        const provider = new FakeSpeechProvider({ heard: hanziOf(scene, role.id, true) })
        const { take } = begin(scene, role.id, provider)
        for (;;) {
          await vi.waitFor(() => expect(['reviewing', 'done']).toContain(take.getState().phase))
          if (take.getState().phase === 'done') break
          take.next()
        }
        // the other character's lines were spoken, in order, at normal speed
        expect(provider.spoken).toEqual(hanziOf(scene, role.id, false).map((text) => ({ text, rate: 1 })))
        // every line of the learner's was heard, judged a pass and logged
        const { attempts } = take.getState()
        expect(attempts).toHaveLength(hanziOf(scene, role.id, true).length)
        expect(attempts.every((a) => a.verdict.passed && a.verdict.judged_by === 'match')).toBe(true)
      })
    }
  }

  it('listens on the learner’s line once the other characters have spoken before it', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    expect(take.getState().index).toBe(1)
    expect(provider.spoken.map((s) => s.text)).toEqual([dinner.lines[0]!.hanzi])
    expect(provider.listening).toBe(true)
  })

  it('starts by listening when the learner has the first line', async () => {
    const { take, provider } = begin(dinner, 'mom')
    await until(take, 'listening')
    expect(take.getState().index).toBe(0)
    expect(provider.spoken).toEqual([])
  })

  it('goes on when audio fails, saying so', async () => {
    const provider = new FakeSpeechProvider({ canSynthesize: false })
    const { take } = begin(dinner, 'kid', provider)
    await until(take, 'listening')
    expect(take.getState().notice).toMatch(/can't speak|cannot speak|no audio/i)
  })
})

describe('judging the learner’s spoken line', () => {
  async function heardKid(heard: string) {
    const ctx = begin(dinner, 'kid')
    await until(ctx.take, 'listening')
    ctx.provider.hear(heard)
    await until(ctx.take, 'reviewing')
    return ctx
  }

  it('judges what was heard against the line and shows the verdict', async () => {
    const { take } = await heardKid(dinner.lines[1]!.hanzi)
    expect(take.getState().verdict).toMatchObject({ passed: true, judged_by: 'match', heard_text: dinner.lines[1]!.hanzi })
    expect(take.getState().attempts).toEqual([])
  })

  it('does not pass a line that was said differently', async () => {
    const { take } = await heardKid('我不知道')
    expect(take.getState().verdict).toMatchObject({ passed: false, judged_by: 'match' })
  })

  it('logs the attempt, then moves to the next line, on next()', async () => {
    const { take, provider } = await heardKid(dinner.lines[1]!.hanzi)
    take.next()
    expect(take.getState().attempts).toHaveLength(1)
    expect(take.getState().attempts[0]).toMatchObject({ lineIndex: 1 })
    await until(take, 'listening')
    expect(take.getState().index).toBe(3)
    expect(provider.spoken.map((s) => s.text)).toContain(dinner.lines[2]!.hanzi)
  })

  it('retries the same line after a miss, logging the miss (tryAgain)', async () => {
    const { take, provider } = await heardKid('我不知道')
    take.tryAgain()
    expect(take.getState().attempts).toHaveLength(1)
    expect(take.getState().attempts[0]!.verdict.passed).toBe(false)
    await until(take, 'listening')
    expect(take.getState().index).toBe(1)
    expect(provider.listenCount).toBe(2)
    expect(take.getState().verdict).toBeNull()
  })

  it('retries without logging anything when the learner says it misheard them', async () => {
    const { take, provider } = await heardKid('他说什么')
    take.misheard()
    await until(take, 'listening')
    expect(take.getState().attempts).toEqual([])
    expect(take.getState().index).toBe(1)
    expect(provider.listenCount).toBe(2)
    provider.hear(dinner.lines[1]!.hanzi)
    await until(take, 'reviewing')
    take.next()
    expect(take.getState().attempts).toHaveLength(1)
    expect(take.getState().attempts[0]!.verdict.passed).toBe(true)
  })

  it('flips a verdict either way, logged as the learner’s own call', async () => {
    const miss = await heardKid('我不知道')
    miss.take.flip()
    expect(miss.take.getState().verdict).toMatchObject({ passed: true, judged_by: 'self' })
    miss.take.next()
    expect(miss.take.getState().attempts[0]!.verdict).toMatchObject({ passed: true, judged_by: 'self' })

    const pass = await heardKid(dinner.lines[1]!.hanzi)
    pass.take.flip()
    expect(pass.take.getState().verdict).toMatchObject({ passed: false, judged_by: 'self' })
    pass.take.next()
    expect(pass.take.getState().attempts[0]!.verdict).toMatchObject({ passed: false, judged_by: 'self' })
  })

  it('puts a flipped verdict back when it is flipped again', async () => {
    const { take } = await heardKid(dinner.lines[1]!.hanzi)
    take.flip()
    take.flip()
    expect(take.getState().verdict).toMatchObject({ passed: true, judged_by: 'match' })
  })

  it('says nothing was heard and lets the learner listen again', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    provider.failListening('no-speech')
    await until(take, 'no-input')
    expect(take.getState().notice).toMatch(/didn't hear/i)
    take.listenAgain()
    await until(take, 'listening')
    expect(provider.listenCount).toBe(2)
  })
})

describe('the cue: when the microphone opens', () => {
  it('pauses listening when the learner taps the mic, and listens again on the next tap', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    take.pause()
    await until(take, 'no-input')
    expect(provider.listening).toBe(false)
    expect(take.getState().notice).toBeNull()
    take.listenAgain()
    await until(take, 'listening')
    expect(provider.listenCount).toBe(2)
  })

  it('with auto-cue off, waits on the learner’s line until they start listening', async () => {
    const provider = new FakeSpeechProvider()
    const take = createTake({ scene: dinner, roleId: 'kid', provider, autoCue: false })
    take.start()
    await until(take, 'no-input')
    expect(take.getState().index).toBe(1)
    expect(provider.listenCount).toBe(0)
    take.listenAgain()
    await until(take, 'listening')
  })

  it('applies a change of auto-cue from the next line on', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    take.setAutoCue(false)
    provider.hear(dinner.lines[1]!.hanzi)
    await until(take, 'reviewing')
    take.next()
    await until(take, 'no-input')
    expect(take.getState().index).toBe(3)
    expect(provider.listenCount).toBe(1)
  })
})

describe('hints', () => {
  async function atKidLine() {
    const ctx = begin(dinner, 'kid')
    await until(ctx.take, 'listening')
    return ctx
  }

  it('replay speaks the line again at normal speed, and is counted for that line', async () => {
    const { take, provider } = await atKidLine()
    take.hint('replay')
    await until(take, 'listening')
    expect(provider.spoken.at(-1)).toEqual({ text: dinner.lines[1]!.hanzi, rate: 1 })
    expect(take.getState().hints[1]).toEqual({ meaning: 0, slower: 0, replay: 1 })
    expect(take.getState().hints[0]).toEqual({ meaning: 0, slower: 0, replay: 0 })
  })

  it('slower speaks the line at a lower rate, and is counted', async () => {
    const { take, provider } = await atKidLine()
    take.hint('slower')
    take.hint('slower')
    await until(take, 'listening')
    expect(provider.spoken.at(-1)).toEqual({ text: dinner.lines[1]!.hanzi, rate: SLOW_RATE })
    expect(take.getState().hints[1]!.slower).toBe(2)
  })

  it('meaning is counted once per line, however often it is tapped', async () => {
    const { take } = await atKidLine()
    take.hint('meaning')
    take.hint('meaning')
    expect(take.getState().hints[1]!.meaning).toBe(1)
    expect(take.getState().phase).toBe('listening')
  })

  it('stops listening while the audio plays, then listens again for the same line', async () => {
    const { take, provider } = await atKidLine()
    take.hint('replay')
    expect(provider.listening).toBe(false)
    await until(take, 'listening')
    expect(provider.listenCount).toBe(2)
    provider.hear(dinner.lines[1]!.hanzi)
    await until(take, 'reviewing')
  })

  it('works while the other character is speaking, then goes on', async () => {
    const { take, provider } = begin(dinner, 'kid')
    take.hint('slower') // the first line is Mom's and is being spoken
    await until(take, 'listening')
    expect(provider.spoken.map((s) => s.rate)).toContain(SLOW_RATE)
    expect(take.getState().hints[0]!.slower).toBe(1)
    expect(take.getState().index).toBe(1)
  })

  it('keeps each line’s counts through to the end of the take', async () => {
    const provider = new FakeSpeechProvider({ heard: hanziOf(taxi, 'passenger', true) })
    const { take } = begin(taxi, 'passenger', provider)
    await until(take, 'reviewing')
    take.hint('meaning')
    take.next()
    await until(take, 'reviewing')
    take.hint('replay')
    take.hint('replay')
    for (;;) {
      take.next()
      await vi.waitFor(() => expect(['reviewing', 'done']).toContain(take.getState().phase))
      if (take.getState().phase === 'done') break
    }
    const { hints } = take.getState()
    expect(hints).toHaveLength(taxi.lines.length)
    expect(hints[1]!.meaning).toBe(1)
    expect(hints[3]!.replay).toBe(2)
  })
})

describe('typed input', () => {
  it('is used when the provider cannot recognize speech, and the take says why', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { take } = begin(dinner, 'kid', provider)
    await until(take, 'typing')
    expect(take.getState().input).toBe('typed')
    expect(take.getState().inputNote).toMatch(/speech recognition/i)
    expect(provider.listenCount).toBe(0)
    take.submitTyped(dinner.lines[1]!.hanzi)
    await until(take, 'reviewing')
    expect(take.getState().verdict).toMatchObject({ passed: true, heard_text: dinner.lines[1]!.hanzi })
  })

  it('judges typed text the same way, with retry and flip', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { take } = begin(dinner, 'kid', provider)
    await until(take, 'typing')
    take.submitTyped('我不知道')
    expect(take.getState().verdict?.passed).toBe(false)
    take.misheard()
    await until(take, 'typing')
    expect(take.getState().attempts).toEqual([])
  })

  it('ignores an empty entry', async () => {
    const provider = new FakeSpeechProvider({ canRecognize: false })
    const { take } = begin(dinner, 'kid', provider)
    await until(take, 'typing')
    take.submitTyped('   ')
    expect(take.getState().phase).toBe('typing')
  })

  it('takes over when the microphone is blocked, and says so', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    provider.failListening('not-allowed')
    await until(take, 'typing')
    expect(take.getState().inputNote).toMatch(/microphone/i)
  })

  it('can be chosen by the learner while listening, and switched back', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    take.typeInstead()
    expect(take.getState().phase).toBe('typing')
    expect(provider.listening).toBe(false)
    take.useMicrophone()
    await until(take, 'listening')
    expect(take.getState().input).toBe('voice')
  })

  it('does not offer the microphone back when the provider cannot recognize', async () => {
    const { take } = begin(dinner, 'kid', new FakeSpeechProvider({ canRecognize: false }))
    await until(take, 'typing')
    take.useMicrophone()
    expect(take.getState().phase).toBe('typing')
  })
})

describe('a scene with no lines', () => {
  it('is finished at once, without error', () => {
    const empty: Scene = { id: 'e', title: 'Empty', roles: [{ id: 'a', name: 'A' }], lines: [] }
    const take = createTake({ scene: empty, roleId: 'a', provider: new FakeSpeechProvider() })
    take.start()
    expect(take.getState().phase).toBe('done')
    expect(take.getState().attempts).toEqual([])
  })
})

// Every line is Mom's, so a learner playing the kid hears several lines in a row.
const allMom: Scene = { ...dinner, lines: dinner.lines.map((l) => ({ ...l, roleId: 'mom' })) }
const held = () => new FakeSpeechProvider({ holdSynthesis: true })

describe('audio in flight', () => {
  it('a hint while the other character is speaking replaces that audio and goes on only once', async () => {
    const { take, provider } = begin(allMom, 'kid', held())
    await vi.waitFor(() => expect(provider.speaking).toBe(1))
    take.hint('slower')
    expect(provider.spoken.map((s) => s.rate)).toEqual([1, SLOW_RATE])
    expect(provider.speaking).toBe(1) // the first was cancelled, not left playing
    expect(take.getState().index).toBe(0)
    provider.finishSpeaking()
    await vi.waitFor(() => expect(take.getState().index).toBe(1))
    // line 0 was not spoken a third time and line 1 is now the one playing
    expect(provider.spoken.map((s) => s.text)).toEqual([allMom.lines[0]!.hanzi, allMom.lines[0]!.hanzi, allMom.lines[1]!.hanzi])
    expect(provider.speaking).toBe(1)
  })

  it('disposing mid-speech cancels the audio and speaks nothing further', async () => {
    const { take, provider } = begin(allMom, 'kid', held())
    await vi.waitFor(() => expect(provider.speaking).toBe(1))
    take.dispose()
    expect(provider.speaking).toBe(0)
    provider.finishSpeaking()
    await new Promise((r) => setTimeout(r, 0))
    expect(provider.spoken).toHaveLength(1)
    expect(take.getState().index).toBe(0)
  })

  it('disposing while a hint plays over the learner’s line does not resume listening', async () => {
    const provider = held()
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'listening')
    take.hint('replay')
    await until(take, 'playing')
    take.dispose()
    expect(provider.speaking).toBe(0)
    provider.finishSpeaking()
    await new Promise((r) => setTimeout(r, 0))
    expect(provider.listenCount).toBe(1)
  })

  it('a hint from the verdict plays the line, keeps the verdict, and returns to reviewing', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true, heard: ['我不知道'] })
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'reviewing')
    const verdict = take.getState().verdict
    take.flip()
    const flipped = take.getState().verdict
    take.hint('replay')
    expect(take.getState().phase).toBe('playing')
    expect(take.getState().resumeTo).toBe('reviewing')
    expect(take.getState().verdict).toBe(flipped)
    provider.finishSpeaking()
    await until(take, 'reviewing')
    expect(take.getState().resumeTo).toBeNull()
    expect(take.getState().verdict).toBe(flipped)
    expect(flipped).not.toBe(verdict)
    expect(take.getState().hints[0]!.replay).toBe(1)
    expect(provider.listenCount).toBe(1) // reviewing does not listen again
  })

  it('a hint after nothing was heard returns to that state, with its notice, without listening again', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true, heard: [{ error: 'no-speech' }] })
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'no-input')
    const notice = take.getState().notice
    take.hint('slower')
    expect(take.getState().phase).toBe('playing')
    expect(take.getState().resumeTo).toBe('no-input')
    provider.finishSpeaking()
    await until(take, 'no-input')
    expect(take.getState().notice).toBe(notice)
    expect(provider.listenCount).toBe(1)
    take.listenAgain() // and the way out still works
    await until(take, 'listening')
  })

  it('a second hint during a hint keeps the original place to return to', async () => {
    const provider = new FakeSpeechProvider({ holdSynthesis: true, heard: ['我不知道'] })
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'reviewing')
    take.hint('slower')
    take.hint('replay')
    expect(take.getState().resumeTo).toBe('reviewing')
    provider.finishSpeaking()
    await until(take, 'reviewing')
  })
})

describe('what the learner is told when listening breaks', () => {
  it('says there is no microphone in plain words, without the error code', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'failed', message: 'audio-capture' }] })
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'no-input')
    expect(take.getState().notice).toMatch(/microphone/i)
    expect(take.getState().notice).not.toMatch(/audio-capture|\(/)
  })

  it('does not show a raw code for any other failure either', async () => {
    const provider = new FakeSpeechProvider({ heard: [{ error: 'failed', message: 'network' }] })
    const { take } = begin(dinner, 'mom', provider)
    await until(take, 'no-input')
    expect(take.getState().notice).not.toMatch(/network|\(/)
  })
})

describe('ending a take', () => {
  it('stops listening when disposed', async () => {
    const { take, provider } = begin(dinner, 'kid')
    await until(take, 'listening')
    take.dispose()
    expect(provider.listening).toBe(false)
  })
})
