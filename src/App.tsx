import { useMemo, useState } from 'react'
import { Packet } from './packet/Packet'
import { Shelf, type Played } from './packet/Shelf'
import type { Role, Scene, SupportLevel } from './scene'
import { starterScenes } from './scenes'
import { createBrowserSpeech } from './speech/browser'
import type { SpeechProvider } from './speech/provider'

/** Until support levels are computed from past attempts (#5), every line has full support. */
const fullSupport = (scene: Scene): SupportLevel[] => scene.lines.map(() => 0)

type Props = {
  scenes?: Scene[]
  speech?: SpeechProvider
  /** Each line's support level for a learner playing `roleId`. */
  support?: (scene: Scene, roleId: string) => SupportLevel[]
}

export default function App({ scenes = starterScenes, speech, support = fullSupport }: Props) {
  const [open, setOpen] = useState<{ scene: Scene; resumeAs: Role | null } | null>(null)
  const [played, setPlayed] = useState<Record<string, string>>({})
  const [last, setLast] = useState<Played | null>(null)
  const provider = useMemo(() => speech ?? createBrowserSpeech(), [speech])

  return (
    <main className="app">
      {open ? (
        <Packet
          scene={open.scene}
          speech={provider}
          support={support}
          resumeAs={open.resumeAs}
          onBegin={(role) => {
            setPlayed({ ...played, [open.scene.id]: role.id })
            setLast({ scene: open.scene, roleId: role.id })
          }}
          onBack={() => setOpen(null)}
        />
      ) : (
        <Shelf
          scenes={scenes}
          played={played}
          last={last}
          support={support}
          onOpen={(scene) => setOpen({ scene, resumeAs: null })}
          onContinue={({ scene, roleId }) => setOpen({ scene, resumeAs: scene.roles.find((r) => r.id === roleId) ?? null })}
        />
      )}
    </main>
  )
}
