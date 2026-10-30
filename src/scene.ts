/** A word of a line: its characters and the pinyin shown above them. */
export type Word = { hanzi: string; pinyin: string }

/**
 * One role's turn in a scene: characters (also split word by word for display), the authored
 * pinyin and an English meaning. `hanzi` and `pinyin` are what is spoken and judged.
 */
export type Line = { roleId: string; hanzi: string; pinyin: string; words: Word[]; english: string }

/** A character the learner can play. */
export type Role = { id: string; name: string }

/** A short stretch of dialogue between named roles. */
export type Scene = { id: string; title: string; roles: Role[]; lines: Line[] }
