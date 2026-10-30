import { useMemo, useState } from 'react'
import type { Role, Scene } from './scene'
import { starterScenes } from './scenes'
import { createBrowserSpeech } from './speech/browser'
import type { SpeechProvider } from './speech/provider'
import { TakeView } from './take/TakeView'

export default function App({ scenes = starterScenes, speech }: { scenes?: Scene[]; speech?: SpeechProvider }) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const provider = useMemo(() => speech ?? createBrowserSpeech(), [speech])

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
      {scene && role && <TakeView scene={scene} role={role} speech={provider} onBack={backToScenes} />}
    </main>
  )
}
