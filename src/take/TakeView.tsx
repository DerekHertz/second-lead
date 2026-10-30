import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Line, Role, Scene } from '../scene'
import type { SpeechProvider } from '../speech/provider'
import { createTake, type Take, type TakeState } from './take'

const percent = (n: number) => `${Math.round(n * 100)}%`

function LineView({ line, scene, roleId, showMeaning }: { line: Line; scene: Scene; roleId: string; showMeaning: boolean }) {
  const speaker = scene.roles.find((r) => r.id === line.roleId)
  const isLearners = line.roleId === roleId
  return (
    <article
      data-learner={isLearners}
      aria-current="true"
      style={{
        borderLeft: isLearners ? '6px solid #c0392b' : '6px solid transparent',
        background: isLearners ? '#fdecea' : undefined,
        padding: '0.5rem 1rem',
      }}
    >
      <p>
        <strong>{speaker?.name}</strong>
        {isLearners && <mark style={{ marginLeft: '0.5rem' }}>Your line</mark>}
      </p>
      <p lang="zh-Hans" style={{ fontSize: '2rem', lineHeight: 2.2 }}>
        {line.words.map((word, i) => (
          <ruby key={i} style={{ marginRight: '0.4em' }}>
            {word.hanzi}
            <rt style={{ fontSize: '0.5em' }}>{word.pinyin}</rt>
          </ruby>
        ))}
      </p>
      {showMeaning && <p lang="en">{line.english}</p>}
    </article>
  )
}

function statusText(state: TakeState, speakerName: string): string {
  switch (state.phase) {
    case 'idle':
      return 'Starting…'
    case 'speaking':
      return `${speakerName} is speaking…`
    case 'listening':
      return 'Listening… say your line.'
    case 'typing':
      return 'Type your line.'
    case 'playing':
      return 'Playing the line…'
    case 'no-input':
      return state.notice ?? 'Nothing was heard.'
    case 'reviewing': {
      const v = state.verdict!
      const outcome = v.passed ? 'Passed' : 'Not yet'
      const by = v.judged_by === 'self' ? ' (your call)' : ''
      return `${outcome}${by}. You said: ${v.heard_text}. Words matched ${percent(v.syllable_match)}, tones ${percent(v.tone_score)}.`
    }
    case 'done':
      return 'Take complete.'
  }
}

function Summary({ state, scene, roleId, onAgain }: { state: TakeState; scene: Scene; roleId: string; onAgain: () => void }) {
  const learnersLines = scene.lines.map((l, i) => [l, i] as const).filter(([l]) => l.roleId === roleId)
  const passed = learnersLines.filter(([, i]) => state.attempts.filter((a) => a.lineIndex === i).at(-1)?.verdict.passed).length
  const total = (kind: 'meaning' | 'slower' | 'replay') => state.hints.reduce((sum, h) => sum + h[kind], 0)
  return (
    <section>
      <h2>Take complete</h2>
      <p>{`Lines passed: ${passed} of ${learnersLines.length}`}</p>
      <p>{`Hints used: meaning ${total('meaning')}, slower ${total('slower')}, replay ${total('replay')}`}</p>
      <p>
        <button onClick={onAgain}>Play again</button>
      </p>
    </section>
  )
}

function TakeBody({ take, scene, role, speech, onAgain }: { take: Take; scene: Scene; role: Role; speech: SpeechProvider; onAgain: () => void }) {
  const state = useSyncExternalStore(take.subscribe, take.getState)
  const [typed, setTyped] = useState('')
  const line = scene.lines[state.index]
  const speakerName = scene.roles.find((r) => r.id === line?.roleId)?.name ?? ''
  const hints = state.hints[state.index]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    take.submitTyped(typed)
    setTyped('')
  }

  if (state.phase === 'done') return <Summary state={state} scene={scene} roleId={role.id} onAgain={onAgain} />

  return (
    <>
      <p>{`Line ${state.index + 1} of ${scene.lines.length}`}</p>
      {state.index > 0 && (
        <ol lang="zh-Hans" aria-label="Lines so far" style={{ color: '#555', paddingLeft: '1.2rem' }}>
          {scene.lines.slice(0, state.index).map((l, i) => (
            <li key={i}>
              {scene.roles.find((r) => r.id === l.roleId)?.name}: {l.hanzi}
            </li>
          ))}
        </ol>
      )}
      {line && <LineView line={line} scene={scene} roleId={role.id} showMeaning={(hints?.meaning ?? 0) > 0} />}

      <p role="status" aria-live="polite" style={{ fontWeight: 'bold', minHeight: '3rem' }}>
        {statusText(state, speakerName)}
      </p>
      {state.inputNote && <p>{state.inputNote}</p>}
      {state.notice && state.phase !== 'no-input' && <p>{state.notice}</p>}

      {state.phase === 'typing' && (
        <form onSubmit={submit}>
          <label>
            Type your line{' '}
            <input lang="zh-Hans" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" style={{ fontSize: '1.2rem' }} />
          </label>{' '}
          <button type="submit">Check my line</button>
          {speech.canRecognize && (
            <>
              {' '}
              <button type="button" onClick={() => take.useMicrophone()}>
                Use the microphone
              </button>
            </>
          )}
        </form>
      )}
      {(state.phase === 'listening' || state.phase === 'no-input') && (
        <p>
          {state.phase === 'no-input' && <button onClick={() => take.listenAgain()}>Listen again</button>}{' '}
          <button onClick={() => take.typeInstead()}>Type instead</button>
        </p>
      )}
      {state.phase === 'reviewing' && (
        <p>
          <button onClick={() => take.next()}>Next line</button> <button onClick={() => take.tryAgain()}>Try again</button>{' '}
          <button onClick={() => take.flip()}>Flip verdict</button> <button onClick={() => take.misheard()}>It misheard me</button>
        </p>
      )}

      <p>
        <button onClick={() => take.hint('meaning')} disabled={(hints?.meaning ?? 0) > 0}>
          Show meaning
        </button>{' '}
        <button onClick={() => take.hint('slower')}>Play slower</button> <button onClick={() => take.hint('replay')}>Replay</button>
      </p>
      {hints && <p>{`Hints on this line: meaning ${hints.meaning}, slower ${hints.slower}, replay ${hints.replay}`}</p>}
    </>
  )
}

/** A take of a scene in a role: speaks the other characters, listens to the learner. */
export function TakeView({ scene, role, speech, onBack }: { scene: Scene; role: Role; speech: SpeechProvider; onBack: () => void }) {
  const [run, setRun] = useState(0)
  return (
    <section>
      <h1>{scene.title}</h1>
      <p>You play {role.name}.</p>
      {scene.lines.length === 0 ? (
        <>
          <p role="alert">This scene has no lines yet, so there is nothing to play.</p>
          <button onClick={onBack}>Back to scenes</button>
        </>
      ) : (
        <>
          <RunningTake key={run} scene={scene} role={role} speech={speech} onAgain={() => setRun(run + 1)} />
          <p>
            <button onClick={onBack}>Back to scenes</button>
          </p>
        </>
      )}
    </section>
  )
}

function RunningTake({ scene, role, speech, onAgain }: { scene: Scene; role: Role; speech: SpeechProvider; onAgain: () => void }) {
  const [take, setTake] = useState<Take | null>(null)
  useEffect(() => {
    const t = createTake({ scene, roleId: role.id, provider: speech })
    setTake(t)
    t.start()
    return () => t.dispose()
  }, [scene, role.id, speech])
  if (!take) return null
  return <TakeBody take={take} scene={scene} role={role} speech={speech} onAgain={onAgain} />
}
