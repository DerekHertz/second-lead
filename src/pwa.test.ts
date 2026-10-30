import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { pwaOptions } from '../pwa.config'

const root = resolve(import.meta.dirname, '..')

describe('PWA config', () => {
  it('declares an installable manifest', () => {
    const manifest = pwaOptions.manifest
    if (!manifest) throw new Error('pwaOptions.manifest is missing')
    expect(manifest.name).toBe('Second Lead')
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.theme_color).toBeTruthy()
    expect(manifest.background_color).toBeTruthy()

    const sizes = (manifest.icons ?? []).map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const icon of manifest.icons ?? []) {
      expect(existsSync(join(root, 'public', icon.src))).toBe(true)
    }
  })

  it('precaches the app shell so it loads offline after a first visit', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate')
    const patterns = pwaOptions.workbox?.globPatterns ?? []
    for (const ext of ['js', 'css', 'html', 'png']) {
      expect(patterns.some((p) => p.includes(ext))).toBe(true)
    }
    // Offline navigation falls back to the app shell
    expect(pwaOptions.workbox?.navigateFallback).toBe('index.html')
  })

  it('emits a manifest and a service worker that precaches the app on build', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'second-lead-build-'))
    try {
      await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } })

      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8'))
      expect(manifest.name).toBe('Second Lead')

      const sw = readFileSync(join(outDir, 'sw.js'), 'utf8')
      expect(sw).toContain('precacheAndRoute')
      expect(sw).toContain('index.html')
      expect(sw).toMatch(/assets\/index-[\w-]+\.js/)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 120_000)
})
