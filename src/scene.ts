/** A word of a line: its characters and the pinyin shown above them. */
export type Word = { hanzi: string; pinyin: string }

/** One role's turn in a scene: characters (word by word), pinyin and an English meaning. */
export type Line = { roleId: string; words: Word[]; english: string }

/** A character the learner can play. */
export type Role = { id: string; name: string }

/** A short stretch of dialogue between named roles. */
export type Scene = { id: string; title: string; roles: Role[]; lines: Line[] }
