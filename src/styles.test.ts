import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest does not hand stylesheets to tests, even as raw text.
const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

// A color written out: #abc, #aabbcc(dd), or rgb()/rgba()/hsl()/hsla().
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi

/** The `:root { ... }` blocks, wherever they sit (top level or inside a media query). */
function rootBlocks(text: string): string[] {
  return [...text.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]!)
}

const tokens = (block: string) => new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!))

describe('design tokens', () => {
  it('writes every color as a token on :root, and nowhere else', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(3)
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
