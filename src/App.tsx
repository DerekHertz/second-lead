import { useState } from 'react'
import { fixtureScenes } from './fixtureScenes'
import type { Line, Role, Scene } from './scene'

function LineView({ line, scene, roleId }: { line: Line; scene: Scene; roleId: string }) {
  const speaker = scene.roles.find((r) => r.id === line.roleId)
  const isLearners = line.roleId === roleId
  return (
    <article
      data-learner={isLearners}
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
      <p lang="en">{line.english}</p>
    </article>
  )
}

function SceneWalk({ scene, role, onBack }: { scene: Scene; role: Role; onBack: () => void }) {
  const [index, setIndex] = useState(0)
  const last = scene.lines.length - 1
  return (
    <section>
      <h1>{scene.title}</h1>
      <p>You play {role.name}.</p>
      <p>
        Line {index + 1} of {scene.lines.length}
      </p>
      <LineView line={scene.lines[index]} scene={scene} roleId={role.id} />
      <p>
        <button onClick={() => setIndex(index - 1)} disabled={index === 0}>
          Previous line
        </button>{' '}
        <button onClick={() => setIndex(index + 1)} disabled={index === last}>
          Next line
        </button>
      </p>
      <p>
        <button onClick={onBack}>Back to scenes</button>
      </p>
    </section>
  )
}

export default function App({ scenes = fixtureScenes }: { scenes?: Scene[] }) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  const backToScenes = () => {
    setScene(null)
    setRole(null)
  }

  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '1rem', fontFamily: 'sans-serif' }}>
      {!scene && (
        <section>
          <h1>Pick a scene</h1>
          <ul>
            {scenes.map((s) => (
              <li key={s.id}>
                <button onClick={() => setScene(s)}>{s.title}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {scene && !role && (
        <section>
          <h1>Pick your role</h1>
          <p>{scene.title}</p>
          <ul>
            {scene.roles.map((r) => (
              <li key={r.id}>
                <button onClick={() => setRole(r)}>{r.name}</button>
              </li>
            ))}
          </ul>
          <button onClick={backToScenes}>Back to scenes</button>
        </section>
      )}
      {scene && role && <SceneWalk scene={scene} role={role} onBack={backToScenes} />}
    </main>
  )
}
