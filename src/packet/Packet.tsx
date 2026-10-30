import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import type { Role, Scene, SupportLevel } from '../scene'
import type { SpeechProvider } from '../speech/provider'
import { createTake, type HintKind, type Take, type TakePhase, type TakeState } from '../take/take'
import { LineView } from './Line'

/** Lines per script page: a few exchanges, as on a page of sides. */
const PER_PAGE = 4

const CHECK_IN = ['rough', 'shaky', 'solid', 'owned it'] as const

const noTake = () => () => {}
const noState = () => null

/** The state of a take, or null before there is one. */
function useTakeState(take: Take | null): TakeState | null {
  return useSyncExternalStore(take?.subscribe ?? noTake, take?.getState ?? noState)
}

type Props = {
  scene: Scene
  speech: SpeechProvider
  support: (scene: Scene, roleId: string) => SupportLevel[]
  /** Open straight onto the script as this role (Continue), instead of at the title page. */
  resumeAs: Role | null
  onBegin: (role: Role) => void
  onBack: () => void
}

/**
 * A scene as a stapled packet: a title page, script pages of a few exchanges each, and an end
 * page. Pages flip up over the staple as the take moves on; the ones still to come stack beneath.
 */
export function Packet({ scene, speech, support, resumeAs, onBegin, onBack }: Props) {
  const [role, setRole] = useState<Role | null>(resumeAs)
  const [started, setStarted] = useState(resumeAs !== null)
  const [run, setRun] = useState(0)
  const [levels, setLevels] = useState<SupportLevel[]>(() => (resumeAs ? support(scene, resumeAs.id) : []))
  const [autoCue, setAutoCue] = useState(true)
  const [listenFirst, setListenFirst] = useState(false)
  const [lifted, setLifted] = useState<Set<number>>(new Set())
  const [review, setReview] = useState<{ page: number; from: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [take, setTake] = useState<Take | null>(null)
  const autoCueRef = useRef(autoCue)
  autoCueRef.current = autoCue

  useEffect(() => {
    if (!started || !role) return
    const t = createTake({ scene, roleId: role.id, provider: speech, autoCue: autoCueRef.current })
    setTake(t)
    t.start()
    return () => {
      t.dispose()
      setTake(null)
    }
  }, [scene, role, speech, started, run])

  const state = useTakeState(take)
  const scriptPages = Math.ceil(scene.lines.length / PER_PAGE)
  const endPage = scriptPages + 1
  const current = !started ? 0 : !state ? 1 : state.phase === 'done' ? endPage : 1 + Math.floor(state.index / PER_PAGE)
  const inView = review && review.from === current ? review.page : current
  const onScript = current >= 1 && current <= scriptPages

  const begin = (r: Role) => {
    setLevels(support(scene, r.id))
    setLifted(new Set())
    setReview(null)
    setStarted(true)
    setRun((n) => n + 1)
    onBegin(r)
  }
  const swapRoles = () => {
    setStarted(false)
    setRole(scene.roles.find((r) => r.id !== role?.id) ?? role)
  }

  const turnTo = (page: number) => setReview(page === current ? null : { page, from: current })
  const hints = state ? state.hints.reduce((sum, h) => sum + h.meaning + h.slower + h.replay, 0) : 0

  const pages: { label: string; body: ReactNode }[] = [
    { label: 'Title page', body: <TitlePage scene={scene} role={role} scriptPages={scriptPages} onPick={setRole} onBegin={begin} /> },
  ]
  for (let p = 0; p < scriptPages; p++) {
    const from = p * PER_PAGE
    pages.push({
      label: `Page ${p + 1}`,
      body: (
        <ScriptPage
          scene={scene}
          last={p === scriptPages - 1}
          from={from}
          roleId={role?.id ?? ''}
          state={started ? state : null}
          levels={levels}
          lifted={lifted}
          listenFirst={listenFirst}
          inView={inView === p + 1}
          onLift={(i) => {
            setLifted(new Set(lifted).add(i))
            take?.hint('meaning')
          }}
        />
      ),
    })
  }
  pages.push({
    label: 'End page',
    body: state?.phase === 'done' && role && (
      <EndPage key={run} scene={scene} roleId={role.id} state={state} onAgain={() => begin(role)} onSwap={swapRoles} onBack={onBack} />
    ),
  })

  return (
    <section className="take">
      <div className="topbar">
        <button className="back" aria-label="Shelf" onClick={onBack}>
          ‹ Shelf
        </button>
        <span className="ti">{scene.title}</span>
        <span className="hc">
          {hints > 0 && (
            <>
              <span aria-hidden="true">{`hints ${'|'.repeat(Math.min(hints, 12))}`}</span>
              <span className="sr-only">{`Hints used: ${hints}`}</span>
            </>
          )}
        </span>
        {inView > 0 && (
          <span className="pnav">
            <button aria-label="Previous page" disabled={inView <= 1 || inView > scriptPages} onClick={() => turnTo(inView - 1)}>
              ‹
            </button>
            <span>{inView === endPage ? 'end' : `p. ${inView} of ${scriptPages}`}</span>
            <button aria-label="Next page" disabled={inView >= current} onClick={() => turnTo(inView + 1)}>
              ›
            </button>
          </span>
        )}
      </div>
      <div className="packet">
        <span className="staple" />
        {pages.map((p, k) => (
          <section
            key={k}
            aria-label={p.label}
            aria-hidden={k !== inView}
            inert={k !== inView}
            className={`page${k < inView ? ' flipped' : ''}${k > inView ? ' under' : ''}`}
            style={{ zIndex: 100 - k, ['--d' as string]: Math.min(Math.max(k - inView, 0), 3) }}
          >
            {k >= 1 && k <= scriptPages && (
              <>
                <span className="phead">{`${scene.title} — sides`}</span>
                <span className="pnum">{`${k}.`}</span>
              </>
            )}
            <div className="body">{p.body}</div>
            <div className="shade" />
          </section>
        ))}
      </div>
      {onScript && state && role && (
        <Dock
          take={take!}
          state={state}
          scene={scene}
          speech={speech}
          reviewing={inView !== current}
          onBackToPage={() => setReview(null)}
          onMenu={() => setMenuOpen(true)}
        />
      )}
      {menuOpen && onScript && state && (
        <TakeMenu
          autoCue={autoCue}
          listenFirst={listenFirst}
          canType={speech.canRecognize && (state.phase === 'listening' || state.phase === 'no-input')}
          onAutoCue={() => {
            take?.setAutoCue(!autoCue)
            setAutoCue(!autoCue)
          }}
          onListenFirst={() => setListenFirst(!listenFirst)}
          onHelp={(change) => {
            const i = state.index
            if (scene.lines[i]?.roleId !== role?.id) return
            setLevels(levels.map((l, k) => (k === i ? (Math.min(3, Math.max(0, (l ?? 0) + change)) as SupportLevel) : l)))
            setLifted(new Set([...lifted].filter((k) => k !== i)))
          }}
          onTypeInstead={() => {
            setMenuOpen(false)
            take?.typeInstead()
          }}
          onLeave={onBack}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </section>
  )
}

function TitlePage({
  scene,
  role,
  scriptPages,
  onPick,
  onBegin,
}: {
  scene: Scene
  role: Role | null
  scriptPages: number
  onPick: (role: Role) => void
  onBegin: (role: Role) => void
}) {
  return (
    <div className="tp">
      <h1>{scene.title}</h1>
      {scene.show && <p className="by">{scene.show}</p>}
      <p className="meta">{`${scene.lines.length} lines · ${scriptPages} ${scriptPages === 1 ? 'page' : 'pages'}`}</p>
      {scene.lines.length === 0 ? (
        <p role="alert">This scene has no lines yet, so there is nothing to play.</p>
      ) : (
        <>
          <h2 className="cast-h">Cast of characters</h2>
          <div className="cast">
            {scene.roles.map((r) => (
              <button key={r.id} className={r.id === role?.id ? 'castrow pick' : 'castrow'} aria-pressed={r.id === role?.id} onClick={() => onPick(r)}>
                <span className="n">{r.name}</span>
                <span className="dots" />
              </button>
            ))}
          </div>
          <p className="pickhint">{role ? `you're playing ${role.name}` : "tap the role you'll play"}</p>
          <button className="begin" disabled={!role} onClick={() => role && onBegin(role)}>
            Begin
          </button>
        </>
      )}
    </div>
  )
}

function ScriptPage({
  scene,
  last,
  from,
  roleId,
  state,
  levels,
  lifted,
  listenFirst,
  inView,
  onLift,
}: {
  scene: Scene
  last: boolean
  from: number
  roleId: string
  state: TakeState | null
  levels: SupportLevel[]
  lifted: Set<number>
  listenFirst: boolean
  inView: boolean
  onLift: (index: number) => void
}) {
  const index = state?.index ?? 0
  const ref = useRef<HTMLDivElement>(null)
  // Keep the current line in the middle of a long page (the page scrolls smoothly, by its CSS).
  useEffect(() => {
    const sheet = ref.current?.closest<HTMLElement>('.page')
    const now = ref.current?.querySelector<HTMLElement>('.now')
    if (inView && sheet && now) sheet.scrollTop = now.offsetTop - sheet.clientHeight / 2 + now.offsetHeight / 2
  }, [inView, index])

  return (
    <div ref={ref}>
      {scene.lines.slice(from, from + PER_PAGE).map((line, k) => {
        const i = from + k
        const isLearners = line.roleId === roleId
        const now = state !== null && state.phase !== 'done' && i === index
        // A verdict on the line the take is on; on the others, the last attempt that was logged.
        const verdict = now ? state.verdict : (state?.attempts.filter((a) => a.lineIndex === i).at(-1)?.verdict ?? null)
        const attempted = verdict !== null || (state?.attempts.some((a) => a.lineIndex === i) ?? false)
        const canLift = now && state.phase !== 'idle'
        return (
          <LineView
            key={i}
            line={line}
            speaker={scene.roles.find((r) => r.id === line.roleId)?.name ?? ''}
            position={i < index || state?.phase === 'done' ? 'past' : now ? 'now' : 'future'}
            isLearners={isLearners}
            level={levels[i] ?? 0}
            revealed={lifted.has(i) || attempted}
            unheard={listenFirst && state?.phase !== 'done' && i >= index}
            speaking={now && state.phase === 'speaking'}
            verdict={verdict}
            onLift={canLift ? () => onLift(i) : null}
          />
        )
      })}
      {!last && <p className="contd">(CONTINUED)</p>}
    </div>
  )
}

function EndPage({
  scene,
  roleId,
  state,
  onAgain,
  onSwap,
  onBack,
}: {
  scene: Scene
  roleId: string
  state: TakeState
  onAgain: () => void
  onSwap: () => void
  onBack: () => void
}) {
  const [checkIn, setCheckIn] = useState<number | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [note, setNote] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  const mine = scene.lines.flatMap((l, i) => (l.roleId === roleId ? [i] : []))
  const lastVerdict = (i: number) => state.attempts.filter((a) => a.lineIndex === i).at(-1)?.verdict
  const passed = mine.filter((i) => lastVerdict(i)?.passed).length
  const missed = mine.filter((i) => state.attempts.some((a) => a.lineIndex === i && !a.verdict.passed)).length
  const hints = state.hints.reduce((sum, h) => sum + h.meaning + h.slower + h.replay, 0)
  const stats: [string, string][] = [
    ['Lines passed', `${passed} of ${mine.length}`],
    ['Hints used', `${hints}`],
    ['Lines missed', `${missed}`],
  ]

  return (
    <>
      <p className="fin" lang="zh-Hans">
        — 完 —<small lang="en">END OF SCENE</small>
      </p>
      <div className="endbody">
        {/* The check-in comes first, so the numbers below cannot bias it (docs/experiment.md). */}
        <h3 ref={heading} tabIndex={-1}>
          How did that take feel?
        </h3>
        <div className="checkin" role="group" aria-label="How did that take feel?">
          {CHECK_IN.map((word, i) => (
            <button key={word} className={checkIn === i + 1 ? 'sel' : undefined} aria-label={word} aria-pressed={checkIn === i + 1} onClick={() => setCheckIn(i + 1)}>
              <b>{i + 1}</b>
              <span>{word}</span>
            </button>
          ))}
        </div>
        <textarea className="notefield" placeholder="a note, if you want…" aria-label="Check-in note" value={note} onChange={(e) => setNote(e.target.value)} />
        {checkIn === null && !skipped && (
          <button className="skip" onClick={() => setSkipped(true)}>
            Skip
          </button>
        )}
        {(checkIn !== null || skipped) && (
          <section className="summary" aria-label="This take">
            <h3>This take</h3>
            <dl>
              {stats.map(([term, value]) => (
                <div key={term} className="stat">
                  <dt>{term}</dt>
                  <span className="dots" />
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="endbtns">
              <button className="prim" onClick={onAgain}>
                Again
              </button>
              <button onClick={onSwap}>Swap roles</button>
              <button onClick={onBack}>Back to shelf</button>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

const ICONS = {
  replay: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  slower: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18c0-4 3-7 7-7h5" />
      <circle cx="18" cy="11" r="2" />
      <path d="M6 18h12" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
}

/** What the mic does, and what it says, in each phase of the take. */
function micFor(view: TakePhase, state: TakeState, take: Take, canRecognize: boolean, speaker: string) {
  const outcome = (v: NonNullable<TakeState['verdict']>) => `${v.passed ? 'Passed' : 'Not yet'}${v.judged_by === 'self' ? ' (your call)' : ''}`
  switch (view) {
    case 'listening':
      return { name: 'Pause listening', label: 'Listening — your cue', cue: true, act: () => take.pause() }
    case 'no-input':
      return { name: state.notice ? 'Listen again' : 'Start listening', label: state.notice ?? 'Tap the mic to speak', act: () => take.listenAgain() }
    case 'typing':
      return canRecognize
        ? { name: 'Use the microphone', label: 'Type your line', act: () => take.useMicrophone() }
        : { name: 'Microphone', label: 'Type your line', act: null }
    case 'reviewing':
      return { name: 'Try again', label: state.verdict ? outcome(state.verdict) : '', act: () => take.tryAgain() }
    case 'speaking':
      return { name: 'Microphone', label: `${speaker} is speaking`, act: null }
    default:
      return { name: 'Microphone', label: 'Starting…', act: null }
  }
}

function Dock({
  take,
  state,
  scene,
  speech,
  reviewing,
  onBackToPage,
  onMenu,
}: {
  take: Take
  state: TakeState
  scene: Scene
  speech: SpeechProvider
  reviewing: boolean
  onBackToPage: () => void
  onMenu: () => void
}) {
  const [typed, setTyped] = useState('')
  // While a hint plays the controls stay where they were, disabled, so nothing moves under a finger.
  const busy = state.phase === 'playing'
  const view: TakePhase = busy ? (state.resumeTo ?? 'playing') : state.phase
  const speaker = scene.roles.find((r) => r.id === scene.lines[state.index]?.roleId)?.name ?? ''
  const mic = micFor(view, state, take, speech.canRecognize, speaker)
  const label = busy ? (state.verdict ? `${mic.label}. Playing the line…` : 'Playing the line…') : mic.label

  const statusRef = useRef<HTMLParagraphElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const micRef = useRef<HTMLButtonElement>(null)
  const previous = useRef<TakePhase>(state.phase)

  // Move focus with the phase: the typed box when it opens, the main action after a verdict or a
  // miss, and the status when the control that had focus is gone. A hint leaves focus alone.
  useEffect(() => {
    const from = previous.current
    previous.current = state.phase
    if (from === state.phase || from === 'playing' || state.phase === 'playing') return
    const target =
      state.phase === 'typing' ? inputRef.current : state.phase === 'reviewing' ? nextRef.current : state.phase === 'no-input' ? micRef.current : null
    if (target) target.focus()
    else if (!document.activeElement || document.activeElement === document.body) statusRef.current?.focus()
  }, [state.phase])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    take.submitTyped(typed)
    setTyped('')
  }
  const hint = (kind: HintKind) => take.hint(kind)

  return (
    <div className="dock">
      <div className="after">
        {reviewing ? (
          <button onClick={onBackToPage}>Back to your page</button>
        ) : (
          view === 'reviewing' &&
          state.verdict && (
            <>
              {!state.verdict.passed && state.verdict.judged_by === 'match' && (
                <button onClick={() => take.misheard()} disabled={busy}>
                  It misheard me
                </button>
              )}
              <button onClick={() => take.flip()} disabled={busy}>
                {state.verdict.passed ? "That wasn't right" : 'I said it right'}
              </button>
              <button ref={nextRef} className="prim" onClick={() => take.next()} disabled={busy}>
                Next line
              </button>
            </>
          )
        )}
      </div>
      {view === 'typing' && (
        <form className="typed" onSubmit={submit}>
          <label>
            Type your line{' '}
            <input ref={inputRef} lang="zh-Hans" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" disabled={busy}>
            Check my line
          </button>
        </form>
      )}
      <div className="dockrow">
        <div className="side">
          <button className="ib" aria-label="Replay" title="Replay" onClick={() => hint('replay')}>
            {ICONS.replay}
          </button>
          <button className="ib" aria-label="Play slower" title="Play slower" onClick={() => hint('slower')}>
            {ICONS.slower}
          </button>
        </div>
        <button
          ref={micRef}
          className={`mic${mic.cue && !busy ? ' cue' : ''}${mic.act ? '' : ' idle'}`}
          aria-label={mic.name}
          disabled={busy || !mic.act}
          onClick={() => mic.act?.()}
        >
          {ICONS.mic}
        </button>
        <div className="side r">
          <button className="ib" aria-label="Take menu" title="Take menu" onClick={onMenu}>
            {ICONS.menu}
          </button>
        </div>
      </div>
      <p ref={statusRef} className="miclabel" tabIndex={-1} role="status" aria-live="polite">
        {label}
      </p>
      {(state.inputNote || (state.notice && state.phase !== 'no-input')) && (
        <p className="notice">{[state.inputNote, state.phase !== 'no-input' ? state.notice : null].filter(Boolean).join(' ')}</p>
      )}
    </div>
  )
}

function TakeMenu({
  autoCue,
  listenFirst,
  canType,
  onAutoCue,
  onListenFirst,
  onHelp,
  onTypeInstead,
  onLeave,
  onClose,
}: {
  autoCue: boolean
  listenFirst: boolean
  canType: boolean
  onAutoCue: () => void
  onListenFirst: () => void
  onHelp: (change: 1 | -1) => void
  onTypeInstead: () => void
  onLeave: () => void
  onClose: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    first.current?.focus()
    return () => opener?.focus()
  }, [])
  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="in" role="dialog" aria-modal="true" aria-label="Take menu">
        <button ref={first} className="row" role="switch" aria-checked={autoCue} aria-label="Auto-cue" onClick={onAutoCue}>
          <span>
            Auto-cue<small>open the mic when your cue comes</small>
          </span>
          <span className={autoCue ? 'tog on' : 'tog'} />
        </button>
        <button className="row" role="switch" aria-checked={listenFirst} aria-label="Listen first" onClick={onListenFirst}>
          <span>
            Listen first<small>cover their lines until you've heard them</small>
          </span>
          <span className={listenFirst ? 'tog on' : 'tog'} />
        </button>
        <div className="row">
          <span>
            This line<small>support for the line you're on</small>
          </span>
          <span className="pair">
            <button onClick={() => onHelp(-1)}>More help</button>
            <button onClick={() => onHelp(1)}>Less help</button>
          </span>
        </div>
        {canType && (
          <button className="row" aria-label="Type instead" onClick={onTypeInstead}>
            <span>
              Type instead<small>answer with the keyboard</small>
            </span>
          </button>
        )}
        <button className="row" onClick={onLeave}>
          <span>Leave the take</span>
          <span aria-hidden="true">›</span>
        </button>
        <button className="row close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
