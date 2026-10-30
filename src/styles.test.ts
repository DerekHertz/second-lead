import { describe, expect, it } from 'vitest'
import css from './styles.css?raw'

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

// A color written out: #abc, #aabbcc(dd), rgb()/rgba()/hsl()/hsla(), or a named color in a style.
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi

/** The `:root { ... }` blocks, wherever they sit (top level or inside a media query). */
function rootBlocks(text: string): string[] {
  return [...text.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]!)
}

const tokens = (block: string) => new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!))

describe('design tokens', () => {
  it('writes every color as a token on :root, and nowhere else', () => {
    const outside = css.replace(/:root\s*\{[^}]*\}/g, '')
    expect(outside.match(COLOR) ?? []).toEqual([])
    for (const [file, source] of Object.entries(sources)) {
      expect(source.match(COLOR) ?? [], file).toEqual([])
    }
  })

  it('redefines every color token for dark mode, by system setting', () => {
    const [light, ...rest] = rootBlocks(css)
    const dark = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?\})\s*\}/)
    expect(dark, 'a prefers-color-scheme: dark block').toBeTruthy()
    const darkTokens = tokens(rootBlocks(dark![1]!).join(''))
    const colorTokens = [...tokens(light!)].filter((t) => new RegExp(`${t}\\s*:[^;]*(#|rgba?\\()`).test(light!))
    expect(colorTokens.length).toBeGreaterThan(10)
    for (const t of colorTokens) expect(darkTokens, t).toContain(t)
    expect(rest.length).toBeGreaterThan(0)
  })
})
