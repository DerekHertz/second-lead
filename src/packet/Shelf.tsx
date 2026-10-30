import type { Scene, SupportLevel } from '../scene'

export type Played = { scene: Scene; roleId: string }

type Props = {
  scenes: Scene[]
  /** The role last played in each scene, by scene id. */
  played: Record<string, string>
  /** The take to continue, once there is one. */
  last: Played | null
  support: (scene: Scene, roleId: string) => SupportLevel[]
  onOpen: (scene: Scene) => void
  onContinue: (last: Played) => void
}

/** How far the learner's lines have faded in the role they last played: one pip per line. */
function Progress({ scene, roleId, support }: { scene: Scene; roleId: string; support: Props['support'] }) {
  const levels = support(scene, roleId)
  const faded = scene.lines.flatMap((l, i) => (l.roleId === roleId ? [(levels[i] ?? 0) > 0] : []))
  return (
    <>
      <span className="pips" aria-hidden="true">
        {faded.map((f, i) => (
          <span key={i} className={f ? 'pip f' : 'pip'} />
        ))}
      </span>
      <span className="cl">{`${faded.filter(Boolean).length} of ${faded.length} faded`}</span>
    </>
  )
}

/** Home: a desk of stapled packets, one per scene, and a blank one to import a script. */
export function Shelf({ scenes, played, last, support, onOpen, onContinue }: Props) {
  const roleName = (p: Played) => p.scene.roles.find((r) => r.id === p.roleId)?.name ?? ''
  return (
    <section className="shelf">
      <h1 className="brand">Second Lead</h1>
      {last && (
        <button className="continue" aria-label={`Continue ${last.scene.title} as ${roleName(last)}`} onClick={() => onContinue(last)}>
          <span>
            <span className="k">Continue</span>
            <span className="t">
              {`${last.scene.title}, as `}
              <span className="hl">{roleName(last)}</span>
            </span>
          </span>
          <span className="arrow" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      <h2>Your scripts</h2>
      <div className="covers">
        {scenes.map((s) => (
          <button key={s.id} className="cover" aria-label={s.title} onClick={() => onOpen(s)}>
            <span className="staple" />
            <span className="ct">{s.title}</span>
            {s.show && <span className="cs">{s.show}</span>}
            <span className="cc">{s.roles.map((r) => r.name).join(' · ')}</span>
            {played[s.id] ? <Progress scene={s} roleId={played[s.id]!} support={support} /> : <span className="cl">not started</span>}
          </button>
        ))}
        {/* Import is #10; the blank packet holds its place on the shelf. */}
        <button className="cover blank" aria-label="Import a script" disabled>
          <span className="ct">+ Import a script</span>
        </button>
      </div>
    </section>
  )
}
